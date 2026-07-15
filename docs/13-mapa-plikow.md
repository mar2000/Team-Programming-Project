# 13. Mapa plików źródłowych

## Katalog główny

- `manage.py` — punkt wejścia poleceń Django.
- `requirements.txt` — zależności Pythona.
- `db.sqlite3` — lokalna baza danych.

## Pakiet projektu `route_editor/`

- `settings.py` — konfiguracja Django, bazy, plików statycznych i logowania.
- `urls.py` — główny routing, w tym widoki uwierzytelniania i aplikacji.
- `wsgi.py` — wejście WSGI.
- `asgi.py` — wejście ASGI.

## Aplikacja `routes/`

- `models.py` — `Drawing` i `DrawingObject`.
- `views.py` — strony, API, walidacja, import, eksport i TikZ.
- `urls.py` — ścieżki aplikacji.
- `admin.py` — rejestracja modeli w panelu administracyjnym.
- `apps.py` — konfiguracja aplikacji.
- `dependencies.py` — graf zależności obiektów.
- `object_tree.py` — operacje na zagnieżdżonych strukturach obiektów.
- `object_type_registry.py` — backendowy rejestr rozszerzonych typów.
- `geometry_command_registry.py` — backendowy rejestr komend konstrukcyjnych.
- `image_recognition_import.py` — import i analiza obrazu w aplikacji.
- `tests.py` — testy automatyczne.

## Migracje

`routes/migrations/` opisuje ewolucję schematu bazy do obecnego modelu `Drawing` + `DrawingObject`. Obecny kod nie korzysta z dawnej, osobnej architektury tras, wierzchołków i krawędzi.

## Szablony

- `base.html` — wspólny layout.
- `drawing_list.html` — lista dokumentów.
- `drawing_form.html` — tworzenie dokumentu.
- `drawing_detail.html` — interaktywny edytor.
- `drawing_confirm_delete.html` — potwierdzenie usunięcia.
- `drawing_import.html` — import JSON.
- `drawing_image_import.html` — import obrazu i korekta wyniku.
- `login.html` — logowanie.
- `register.html` — rejestracja.

## Pliki statyczne

- `drawing_editor.js` — główna logika edytora.
- `drawing_editor.css` — pełny styl edytora.
- `tool_registry.js` — rejestr narzędzi i API pluginów.
- `geometry_command_registry.js` — frontendowe definicje komend.
- `ratio_point_plugin.js` — działający przykład dodatku.
- `example_plugin.js` — minimalny przykład pluginu.
- `route_editor.js` — zachowanie ogólnych elementów interfejsu.

## Tagi szablonów

- `templatetags/route_filters.py` — pomocnicze filtry używane w HTML.

## Eksperymenty rozpoznawania obrazu

- `generate_samples.py` — generowanie próbek.
- `detect_vertices.py` — punkty.
- `detect_edges.py` — odcinki.
- `detect_labels.py` — OCR.
- `reconstruct_graph.py` — rekonstrukcja struktury.
- `to_route_editor.py` — konwersja do formatu dokumentu.
- `run_experiment.py` — uruchomienie pipeline'u.
- `samples/` — wejścia.
- `results/` — wyniki i diagnostyka.
