# 10. Instalacja, konfiguracja i uruchamianie

## 10.1. Wymagania

- Python 3.10 lub nowszy;
- pip;
- przeglądarka z obsługą SVG i nowoczesnego JavaScript;
- opcjonalnie Tesseract OCR dla pełnej funkcjonalności eksperymentów obrazowych.

Zależności Pythona:

```text
Django>=4.2,<5.0
Pillow>=10.0
numpy>=1.26
opencv-python>=4.8
pytesseract>=0.3.10
```

## 10.2. Środowisko wirtualne

Linux/macOS:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Windows PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## 10.3. Baza danych

```bash
python manage.py migrate
```

Projekt używa SQLite, a plik bazy znajduje się domyślnie jako `db.sqlite3` w katalogu projektu.

## 10.4. Uruchomienie serwera

```bash
python manage.py runserver
```

Domyślny adres:

```text
http://127.0.0.1:8000/
```

## 10.5. Konto użytkownika

Konto można utworzyć poprzez formularz rejestracji. Alternatywnie konto administracyjne:

```bash
python manage.py createsuperuser
```

Panel administracyjny jest dostępny pod `/admin/`.

## 10.6. Eksperymenty obrazowe

```bash
python -m experiments.image_recognition.run_experiment
```

Pełny OCR wymaga zainstalowanego programu Tesseract w systemie operacyjnym. Sam pakiet `pytesseract` jest jedynie interfejsem Pythona.

## 10.7. Konfiguracja produkcyjna

Aktualne `settings.py` ma ustawienia deweloperskie:

- jawny `SECRET_KEY`;
- `DEBUG = True`;
- puste `ALLOWED_HOSTS`;
- SQLite;
- pliki statyczne bez produkcyjnego pipeline'u.

Przed wdrożeniem należy co najmniej:

1. przenieść sekret do zmiennej środowiskowej;
2. wyłączyć debug;
3. ustawić hosty;
4. skonfigurować `STATIC_ROOT` i `collectstatic`;
5. rozważyć PostgreSQL;
6. wymusić HTTPS;
7. skonfigurować nagłówki bezpieczeństwa;
8. ustawić kopie zapasowe.
