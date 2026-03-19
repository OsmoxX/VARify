import urllib.request
import urllib.error
import concurrent.futures

# Podmień na swój pełny adres URL, jeśli testujesz inny endpoint
URL = "http://localhost:8000/api/upcoming-matches/"

def send_request(i):
    try:
        # Tworzymy zapytanie
        req = urllib.request.Request(URL)
        # Wysyłamy i odczytujemy kod odpowiedzi (np. 200)
        with urllib.request.urlopen(req) as response:
            return response.getcode()
    except urllib.error.HTTPError as e:
        # Jeśli serwer odrzuci zapytanie (np. błąd 429), łapiemy to tutaj
        return e.code
    except urllib.error.URLError as e:
        return 0

print("Rozpoczynam zmasowany atak (100 zapytań)...")

# Używamy 20 "wątków" naraz, żeby uderzyć w serwer w tej samej chwili
with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
    results = list(executor.map(send_request, range(100)))

# Podsumowanie wyników
sukcesy = results.count(200)
blokady = results.count(429)

print("=== WYNIKI ===")
print(f"Przepuszczono (200 OK): {sukcesy}")
print(f"Zablokowano (429 Too Many Requests): {blokady}")

if blokady > 0:
    print("🛡️ Tarcza działa! Serwer obronił się przed spamem.")
else:
    print("⚠️ Uwaga! Wszystkie zapytania przeszły. Throttling może być źle skonfigurowany.")