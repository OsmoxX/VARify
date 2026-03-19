import pytest
from django.db import IntegrityError
from matches.models import CachedImage

# ==========================================
# TESTY: HAPPY PATH
# ==========================================
@pytest.mark.django_db
def test_cached_image_creation_and_str_method():
    # 1. ARRANGE & ACT: Tworzymy obrazek z fałszywymi danymi binarnymi (bajty)
    dummy_binary_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR'
    
    image = CachedImage.objects.create(
        entity_type='player',
        api_id=999,
        content=dummy_binary_data
    )

    # 2. ASSERT: Sprawdzamy czy poprawnie się zapisał
    assert image.content == dummy_binary_data
    assert isinstance(image.content, bytes), "Pole content powinno przechowywać bajty!"
    
    # Sprawdzamy czy domyślny content_type zadziałał
    assert image.content_type == 'image/jpeg'
    
    # Sprawdzamy metodę __str__
    assert str(image) == "CachedImage(player, 999)"

# ==========================================
# TESTY: EDGE CASES (SAD PATH)
# ==========================================
@pytest.mark.django_db
def test_cached_image_unique_together_constraint():
    # 1. ARRANGE: Zapisujemy herb drużyny do bazy
    CachedImage.objects.create(
        entity_type='team',
        api_id=123,
        content=b'pierwszy_obrazek'
    )

    # 2. ACT & ASSERT: Próbujemy zapisać INNY herb, ale dla TEJ SAMEJ drużyny
    # Używamy context managera 'pytest.raises', który mówi: 
    # "Ten blok kodu MUSI wyrzucić błąd IntegrityError. Jeśli nie wyrzuci, test obleje!"
    with pytest.raises(IntegrityError):
        CachedImage.objects.create(
            entity_type='team',
            api_id=123,
            content=b'zupelnie_inny_obrazek'
        )