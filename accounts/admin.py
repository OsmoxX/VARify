from django.contrib import admin
from .models import Profile


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "tier", "stripe_customer_id")
    list_filter = ("tier",)
    search_fields = ("user__username",)
