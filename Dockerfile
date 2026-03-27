# 1. Zaczynamy od gotowego, oficjalnego obrazu Pythona (lekka wersja "slim")
FROM python:3.11-slim

# 2. Wyłączamy buforowanie logów, żeby od razu widzieć printy w konsoli Dockera
ENV PYTHONUNBUFFERED=1

# Instalujemy pakiety systemowe potrzebne dla MySQL
RUN apt-get update && apt-get install -y \
    gcc \
    default-libmysqlclient-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*
# 3. Ustawiamy katalog roboczy wewnątrz kontenera
WORKDIR /app

# 4. Kopiujemy z Twojego Maca plik z listą bibliotek do kontenera
COPY requirements.txt .

# 5. Instalujemy biblioteki (Docker robi to wewnątrz siebie, nie na Twoim Macu!)
RUN pip install --no-cache-dir -r requirements.txt
# 6. Kopiujemy całą resztę Twojego kodu (pliki Django) do kontenera
COPY . .

# 7. Domyślna komenda, która uruchomi serwer po starcie kontenera
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]