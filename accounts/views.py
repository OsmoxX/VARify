from django.shortcuts import render
import stripe
from django.conf import settings
from django.shortcuts import redirect
from django.urls import reverse
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.models import User
from .models import SubscriptionTier
from django.contrib.auth.decorators import login_not_required
from django.utils.translation import get_language
from typing import Literal, cast
# Create your views here.
def subscribe_view(request):
    return render(request, 'accounts/subscribe.html')

# Ustawiamy klucz tajny dla biblioteki Stripe
stripe.api_key = settings.STRIPE_SECRET_KEY

@login_required
def create_checkout_session(request, plan):
    # 1. Wybieramy odpowiednie Price ID na podstawie tego, co kliknął użytkownik
    if plan == 'plus':
        price_id = settings.STRIPE_PRICE_ID_PLUS
    elif plan == 'premium':
        price_id = settings.STRIPE_PRICE_ID_PREMIUM
    else:
        return redirect('subscribe') # Jeśli ktoś wpisze dziwny adres, wraca do cennika

    # 2. Budujemy pełne adresy URL dla sukcesu i anulowania
    # (Stripe potrzebuje wiedzieć, gdzie odesłać klienta po płatności)
    domain_url = request.build_absolute_uri('/')[:-1] # Pobiera bazowy adres np. http://localhost:8000
    success_url = domain_url + reverse('home') + '?payment=success'
    cancel_url = domain_url + reverse('subscribe') + '?payment=cancelled'
    StripeLocale = Literal['auto', 'en', 'pl']
    locale_map = {'pl': 'pl', 'en': 'en', 'uk': 'auto'} 
    current_lang = get_language() or 'en'
    raw_locale = locale_map.get(current_lang, 'auto')
    stripe_locale = cast(StripeLocale, raw_locale)

    try:
        # 3. Gadamy ze Stripe'em - prosimy o utworzenie sesji kasy
        checkout_session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            line_items=[
                {
                    'price': price_id,
                    'quantity': 1,
                },
            ],
            mode='subscription', # Ważne: To jest subskrypcja!
            success_url=success_url,
            cancel_url=cancel_url,
            # Przekazujemy ID użytkownika z Django do Stripe, żebyśmy wiedzieli kto płaci
            client_reference_id=request.user.id,
            metadata={'tier': plan},
            locale=stripe_locale,
        )
        # 4. Przekierowujemy klienta na wygenerowany przez Stripe bezpieczny adres
        return redirect(checkout_session.url or reverse('subscribe'), code=303)
    except Exception as e:
        # W razie błędu awaryjnego z serwerami Stripe
        print(f"Stripe error: {e}")
        return redirect('subscribe')


# -- Webhook --
@csrf_exempt
@login_not_required
def stripe_webhook(request):
    payload = request.body
    sig_header = request.META.get('HTTP_STRIPE_SIGNATURE')
    event = None

    try:
        # Konstruujemy zdarzenie i WERYFIKUJEMY podpis (To zapewnia 100% bezpieczeństwa)
        event = stripe.Webhook.construct_event(
            payload, sig_header, settings.STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        # Błędny ładunek (payload)
        return HttpResponse(status=400)
    except stripe.error.SignatureVerificationError:
        # Błędny podpis (ktoś podszywa się pod Stripe!)
        print("⚠️ Błąd weryfikacji podpisu Stripe!")
        return HttpResponse(status=400)

    # Jeśli płatność faktycznie się powiodła
    if event.type == 'checkout.session.completed':
        session = event.data.object
        
        user_id = getattr(session, 'client_reference_id', None)
        
        tier_purchased = None
        if getattr(session, 'metadata', None):
            tier_purchased = getattr(session.metadata, 'tier', None)

        if user_id and tier_purchased:
            try:
                user = User.objects.get(id=user_id)
                # Aktualizacja do wykupionego planu
                if tier_purchased == 'plus':
                    user.profile.tier = SubscriptionTier.PLUS
                elif tier_purchased == 'premium':
                    user.profile.tier = SubscriptionTier.PREMIUM
                
                # Zapisujemy ID klienta ze Stripe
                user.profile.stripe_customer_id = getattr(session, 'customer', None)
                user.profile.save()
                
                print(f"✅ SUKCES! Zaktualizowano konto {user.username} do planu {tier_purchased.upper()}")
            
            except User.DoesNotExist:
                print("❌ Błąd: Nie znaleziono użytkownika.")

    return HttpResponse(status=200)
