"""
accounts/management/commands/create_e2e_users.py

Management command to seed the three dedicated E2E test users with correct
subscription tiers. Run once before executing Playwright tests:

    docker compose exec web python manage.py create_e2e_users

Users created:
  e2e_free_user    — tier: FREE
  e2e_plus_user    — tier: PLUS
  e2e_premium_user — tier: PREMIUM

Passwords are read from env vars (with sensible defaults for local dev):
  E2E_PASSWORD_FREE    (default: E2e!Free2024#)
  E2E_PASSWORD_PLUS    (default: E2e!Plus2024#)
  E2E_PASSWORD_PREMIUM (default: E2e!Premium2024#)
"""

import os
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from accounts.models import Profile, SubscriptionTier

E2E_USERS = [
    {
        "username": os.environ.get("E2E_USERNAME_FREE", "e2e_free_user"),
        "password": os.environ.get("E2E_PASSWORD_FREE", "E2e!Free2024#"),
        "email": "e2e_free@varify.test",
        "tier": SubscriptionTier.FREE,
    },
    {
        "username": os.environ.get("E2E_USERNAME_PLUS", "e2e_plus_user"),
        "password": os.environ.get("E2E_PASSWORD_PLUS", "E2e!Plus2024#"),
        "email": "e2e_plus@varify.test",
        "tier": SubscriptionTier.PLUS,
    },
    {
        "username": os.environ.get("E2E_USERNAME_PREMIUM", "e2e_premium_user"),
        "password": os.environ.get("E2E_PASSWORD_PREMIUM", "E2e!Premium2024#"),
        "email": "e2e_premium@varify.test",
        "tier": SubscriptionTier.PREMIUM,
    },
]


class Command(BaseCommand):
    help = "Create (or update) the three E2E test users: Free, Plus, Premium."

    def handle(self, *args, **options):
        for cfg in E2E_USERS:
            user, created = User.objects.get_or_create(
                username=cfg["username"],
                defaults={"email": cfg["email"]},
            )
            user.set_password(cfg["password"])
            user.save()

            profile, _ = Profile.objects.get_or_create(user=user)
            profile.tier = cfg["tier"]
            profile.save()

            status = "created" if created else "updated"
            self.stdout.write(
                self.style.SUCCESS(
                    f"  ✅  {status:7s} — {user.username!r:22s}  tier={profile.tier}"
                )
            )

        self.stdout.write(self.style.SUCCESS("\nAll E2E users are ready."))
