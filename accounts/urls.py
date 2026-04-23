from django.urls import path
from . import views

urlpatterns = [
    path("subscribe/", views.subscribe_view, name="subscribe"),
    path(
        "create-checkout-session/<str:plan>/",
        views.create_checkout_session,
        name="create-checkout-session",
    ),
]
