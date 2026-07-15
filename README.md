# Route Editor


> Dokument opisuje architekturę, model danych, warstwę serwerową i kliencką, funkcjonalności edytora, konstrukcje geometryczne, rozszerzenia, import obrazów, eksport, testy, instalację oraz zalecenia rozwojowe.

## Spis treści

- [1. Streszczenie projektu](#1-streszczenie-projektu)
- [2. Cel, odbiorcy i zakres systemu](#2-cel-odbiorcy-i-zakres-systemu)
  - [2.1. Cel funkcjonalny](#21-cel-funkcjonalny)
  - [2.2. Typowi użytkownicy](#22-typowi-użytkownicy)
  - [2.3. Zakres obecnej wersji](#23-zakres-obecnej-wersji)
- [3. Stos technologiczny](#3-stos-technologiczny)
  - [3.1. Zależności deklarowane](#31-zależności-deklarowane)
- [4. Architektura systemu](#4-architektura-systemu)
  - [4.1. Podział warstw](#41-podział-warstw)
  - [4.2. Główny przepływ danych](#42-główny-przepływ-danych)
  - [4.3. Dwie generacje edytora](#43-dwie-generacje-edytora)
- [5. Model danych](#5-model-danych)
  - [5.1. Drawing](#51-drawing)
  - [5.2. DrawingObject](#52-drawingobject)
  - [5.3. Integralność danych](#53-integralność-danych)
- [6. Warstwa serwerowa Django](#6-warstwa-serwerowa-django)
  - [6.1. Routing](#61-routing)
  - [6.2. Widoki i API](#62-widoki-i-api)
  - [6.3. Walidacja](#63-walidacja)
  - [6.4. Operacje masowe i atomowość](#64-operacje-masowe-i-atomowość)
- [7. Edytor po stronie klienta](#7-edytor-po-stronie-klienta)
  - [7.1. Aktywne skrypty](#71-aktywne-skrypty)
  - [7.2. Rejestr narzędzi](#72-rejestr-narzędzi)
  - [7.3. Model interakcji](#73-model-interakcji)
  - [7.4. Renderowanie SVG](#74-renderowanie-svg)
- [8. Katalog funkcjonalności](#8-katalog-funkcjonalności)
  - [8.1. Zarządzanie użytkownikiem i dokumentami](#81-zarządzanie-użytkownikiem-i-dokumentami)
  - [8.2. Zaznaczanie i edycja](#82-zaznaczanie-i-edycja)
  - [8.3. Ustawienia rysunku](#83-ustawienia-rysunku)
  - [8.4. Grafy](#84-grafy)
  - [8.5. Geometria podstawowa](#85-geometria-podstawowa)
  - [8.6. Tekst i etykiety](#86-tekst-i-etykiety)
  - [8.7. Wykresy](#87-wykresy)
- [9. Konstrukcje geometryczne i zależności](#9-konstrukcje-geometryczne-i-zależności)
  - [9.1. Mechanizm zależności](#91-mechanizm-zależności)
  - [9.2. Obsługa przypadków zdegenerowanych](#92-obsługa-przypadków-zdegenerowanych)
- [10. Architektura pluginów i rozszerzalność](#10-architektura-pluginów-i-rozszerzalność)
  - [10.1. Rejestr typów obiektów](#101-rejestr-typów-obiektów)
  - [10.2. Rejestr komend geometrycznych](#102-rejestr-komend-geometrycznych)
  - [10.3. Rejestr narzędzi](#103-rejestr-narzędzi)
  - [10.4. Przykładowy plugin ratio point](#104-przykładowy-plugin-ratio-point)
- [11. Import obrazu i moduł rozpoznawania](#11-import-obrazu-i-moduł-rozpoznawania)
  - [11.1. Cel](#111-cel)
  - [11.2. Pipeline kroku 91](#112-pipeline-kroku-91)
  - [11.3. Pliki modułu](#113-pliki-modułu)
  - [11.4. Ograniczenia obecnego podejścia](#114-ograniczenia-obecnego-podejścia)
  - [11.5. Zalecany kierunek rozwoju AI](#115-zalecany-kierunek-rozwoju-ai)
- [12. Import i eksport](#12-import-i-eksport)
  - [12.1. JSON](#121-json)
  - [12.2. TikZ](#122-tikz)
  - [12.3. SVG i PNG](#123-svg-i-png)
- [13. Testy i jakość](#13-testy-i-jakość)
  - [13.1. Zakres testów](#131-zakres-testów)
  - [13.2. Status uruchomienia testów w środowisku dokumentacyjnym](#132-status-uruchomienia-testów-w-środowisku-dokumentacyjnym)
- [14. Instalacja i uruchomienie](#14-instalacja-i-uruchomienie)
  - [14.1. Wymagania](#141-wymagania)
  - [14.2. Procedura](#142-procedura)
  - [14.3. Testy](#143-testy)
  - [14.4. Ważna uwaga o plikach .md](#144-ważna-uwaga-o-plikach-md)
- [15. Konfiguracja, bezpieczeństwo i wdrożenie](#15-konfiguracja-bezpieczeństwo-i-wdrożenie)
- [16. Ograniczenia i dług techniczny](#16-ograniczenia-i-dług-techniczny)
- [17. Rekomendowany plan dalszego rozwoju](#17-rekomendowany-plan-dalszego-rozwoju)
- [18. Inwentarz najważniejszych plików](#18-inwentarz-najważniejszych-plików)
- [19. Słownik pojęć](#19-słownik-pojęć)
- [20. Podsumowanie](#20-podsumowanie)

---

# 1. Streszczenie projektu

Route Editor jest aplikacją internetową służącą do tworzenia, edycji, przechowywania i eksportowania strukturalnych rysunków matematycznych. System obejmuje trzy główne tryby: grafy, geometrię oraz wykresy. Użytkownik pracuje na interaktywnym obszarze SVG, a obiekty rysunku są przechowywane jako rekordy o typie namespacowanym, danych geometrycznych i stylu.

Najważniejszą cechą systemu jest rozdzielenie warstwy wizualnej od strukturalnej. Punkt, odcinek, okrąg, wykres lub etykieta nie są jedynie pikselami na ekranie, lecz obiektami posiadającymi identyfikator, typ, dane, styl, kolejność i zależności. Pozwala to na przesuwanie obiektów, automatyczne przeliczanie konstrukcji zależnych, zapis do bazy, duplikowanie, cofanie zmian oraz eksport do TikZ i JSON.

| **Obszar**                      | **Stan**                                                                                                    |
|---------------------------------|-------------------------------------------------------------------------------------------------------------|
| Główny edytor                   | Aktywny; szablon drawing_detail.html ładuje pliki kroku 90.                                                 |
| Rozpoznawanie obrazu            | Aktywne jako import obrazu; krok 91.                                                                        |
| Starszy edytor Route/Point/Edge | Zachowany pod adresami legacy; ukryty z głównego interfejsu.                                                |
| Baza danych                     | SQLite; modele Django.                                                                                      |
| Testy                           | 66 klas testowych i 376 metod testowych wykrytych statycznie.                                               |
| Dokumentacja historyczna        | Brak kompletnej dokumentacji krok po kroku w archiwum; historia jest rekonstruowana z testów i nazw plików. |

# 2. Cel, odbiorcy i zakres systemu

## 2.1. Cel funkcjonalny

- Tworzenie rysunków grafowych: wierzchołki, krawędzie skierowane i nieskierowane, etykiety.

- Tworzenie konstrukcji geometrycznych: punkty, odcinki, okręgi, wielokąty i punkty szczególne trójkąta.

- Tworzenie wykresów danych oraz funkcji z osiami, legendą i niepewnościami.

- Edycja stylów obiektów i ustawień rysunku.

- Eksport rysunku do formatów użytecznych w publikacjach i dalszej obróbce.

- Import istniejącego dokumentu JSON oraz półautomatyczna rekonstrukcja rysunku z obrazu.

- Zapewnienie architektury rozszerzalnej przez rejestry narzędzi, komend i typów obiektów.

## 2.2. Typowi użytkownicy

Aplikacja jest przeznaczona przede wszystkim dla studentów, nauczycieli, autorów materiałów matematycznych oraz osób przygotowujących ilustracje do dokumentów LaTeX. Może również pełnić rolę eksperymentalnej platformy do badań nad rekonstrukcją diagramów z obrazów.

## 2.3. Zakres obecnej wersji

Obecna wersja jest rozbudowanym prototypem/MVP. Zawiera działające mechanizmy domenowe, rozbudowany interfejs klienta i szeroki zestaw testów regresyjnych, lecz konfiguracja serwera nadal ma charakter deweloperski i nie jest przygotowana do bezpośredniego wdrożenia produkcyjnego.

# 3. Stos technologiczny

| **Technologia**         | **Rola**                                                                       |
|-------------------------|--------------------------------------------------------------------------------|
| Python                  | Język warstwy serwerowej, walidacji, eksportu i rozpoznawania obrazu.          |
| Django 4.2              | Framework MVC/MVT, ORM, uwierzytelnianie, widoki, formularze, routing i testy. |
| SQLite                  | Domyślna baza danych projektu.                                                 |
| HTML + Django Templates | Generowanie interfejsu i osadzanie danych konfiguracyjnych.                    |
| CSS                     | Układ edytora, panele, szuflady, formularze i responsywność.                   |
| JavaScript              | Cała interaktywna logika edytora SVG, narzędzia, historia, eksport klienta.    |
| SVG                     | Główna powierzchnia rysunkowa i reprezentacja wizualna obiektów.               |
| Pillow                  | Odczyt i przetwarzanie obrazów.                                                |
| NumPy                   | Operacje tablicowe w przetwarzaniu obrazu.                                     |
| OpenCV                  | Detekcja punktów, segmentów i okręgów.                                         |
| pytesseract             | Podstawa do OCR etykiet tekstowych.                                            |
| Matplotlib              | Eksport grafiki PNG w starszej części systemu.                                 |

## 3.1. Zależności deklarowane

```text
Django\>=4.2,\<5.0
Pillow\>=10.0
matplotlib\>=3.8
numpy\>=1.26
opencv-python\>=4.8
pytesseract\>=0.3.10
```

# 4. Architektura systemu

## 4.1. Podział warstw

| **Warstwa**    | **Odpowiedzialność**                                                | **Główne pliki**                                                       |
|----------------|---------------------------------------------------------------------|------------------------------------------------------------------------|
| Prezentacja    | Szablony stron, formularze, panele edytora.                         | routes/templates/routes/\*.html                                        |
| Klient         | Renderowanie SVG, obsługa narzędzi, zaznaczenia, historia, eksport. | drawing_editor_krok90_labels_text.js, tool_registry_krok90.js          |
| API/widoki     | CRUD rysunków i obiektów, walidacja, eksport, import.               | routes/views.py, routes/urls.py                                        |
| Domena         | Typy obiektów, zależności, konstrukcje geometryczne.                | object_type_registry.py, geometry_command_registry.py, dependencies.py |
| Persystencja   | Modele i migracje.                                                  | models.py, migrations/                                                 |
| Analiza obrazu | Detekcja prymitywów i budowanie dokumentu Route Editor.             | image_recognition_import.py, experiments/image_recognition/            |
| Testy          | Testy modeli, widoków, API, UI i regresji kroków.                   | routes/tests.py                                                        |

## 4.2. Główny przepływ danych

1.  Użytkownik otwiera rysunek. Widok DrawingDetailView pobiera model Drawing i jego DrawingObject.

2.  Szablon drawing_detail.html przekazuje dane początkowe i ładuje rejestry oraz aktywny skrypt edytora.

3.  JavaScript buduje lokalny model obiektów i renderuje go jako SVG.

4.  Operacja użytkownika tworzy lub modyfikuje obiekt strukturalny.

5.  Klient wysyła żądanie JSON do endpointu kolekcji, szczegółu obiektu albo zapisu ustawień.

6.  Serwer waliduje typ, dane, styl, referencje, tryb rysunku i zależności.

7.  ORM zapisuje rekord w SQLite.

8.  Klient aktualizuje historię, listę obiektów i renderowanie zależnych konstrukcji.

## 4.3. Dwie generacje edytora

Projekt zawiera starszą generację opartą o modele Route, Point i Edge oraz nową generację opartą o Drawing i DrawingObject. Zachowanie starszej części jest świadomą strategią migracyjną: pozwala porównywać zachowanie, utrzymać kompatybilność i stopniowo przenosić funkcjonalności.

# 5. Model danych

| **Model**       | **Pola wykryte w kodzie**                                                                                                     |
|-----------------|-------------------------------------------------------------------------------------------------------------------------------|
| BackgroundImage | title, image, uploaded_at                                                                                                     |
| Route           | user, title, background, created_at, updated_at, vertex_color, vertex_text_color, edge_color                                  |
| Point           | route, x, y, order                                                                                                            |
| Edge            | route, start_point, end_point, created_at                                                                                     |
| Drawing         | MODE_GRAPH, MODE_GEOMETRY, MODE_PLOT, MODE_MIXED, MODE_CHOICES, user, title, mode, metadata, settings, created_at, updated_at |
| DrawingObject   | drawing, object_id, type, data, style, order, created_at, updated_at                                                          |

## 5.1. Drawing

Drawing reprezentuje dokument rysunkowy należący do użytkownika. Pole mode ogranicza dostępne narzędzia i typy obiektów. metadata przechowuje informacje dokumentowe, a settings ustawienia takie jak siatka, przyciąganie, domyślne style i preferencje widoku.

## 5.2. DrawingObject

DrawingObject jest uniwersalnym rekordem obiektu. object_id jest identyfikatorem logicznym unikalnym w obrębie rysunku. type ma postać np. graph.vertex, geometry.circle lub plot.chart. data przechowuje geometrię i referencje, style parametry wizualne, a order steruje kolejnością.

> {  
> "object_id": "p1",  
> "type": "geometry.point",  
> "data": {"x": 120, "y": 180, "label": "A"},  
> "style": {"stroke": "#000000", "radius": 6, "showLabel": true},  
> "order": 0  
> }

## 5.3. Integralność danych

- Unikalność object_id w obrębie jednego rysunku jest wymuszana ograniczeniem bazy.

- Usunięcie Drawing kaskadowo usuwa DrawingObject.

- Walidacja serwerowa sprawdza schemat obiektu, referencje i zgodność z trybem.

- Operacje masowe są porządkowane według zależności i wykonywane atomowo.

- Zależności mogą być remapowane podczas duplikowania obiektów.

# 6. Warstwa serwerowa Django

## 6.1. Routing

| **Ścieżka**                                            | **Widok**                   | **Nazwa URL**               |
|--------------------------------------------------------|-----------------------------|-----------------------------|
| /                                                      | DrawingListView             | home                        |
| drawings/                                              | DrawingListView             | drawing_list                |
| drawings/create/                                       | DrawingCreateView           | drawing_create              |
| drawings/import/                                       | import_drawing_json         | drawing_import_json         |
| drawings/import/image/                                 | import_drawing_image        | drawing_import_image        |
| drawings/\<int:pk\>/                                   | DrawingDetailView           | drawing_detail              |
| drawings/\<int:pk\>/delete/                            | DrawingDeleteView           | drawing_delete              |
| drawings/\<int:pk\>/duplicate/                         | duplicate_drawing           | drawing_duplicate           |
| drawings/\<int:pk\>/export/tikz/                       | export_drawing_tikz         | drawing_export_tikz         |
| drawings/\<int:pk\>/export/json/                       | export_drawing_json         | drawing_export_json         |
| drawings/\<int:pk\>/export/tikz/preview/               | drawing_tikz_preview        | drawing_tikz_preview        |
| drawings/\<int:pk\>/settings/                          | drawing_settings_api        | drawing_settings_api        |
| drawings/\<int:drawing_id\>/objects/                   | drawing_objects_collection  | drawing_objects_collection  |
| drawings/\<int:drawing_id\>/objects/bulk/              | drawing_objects_bulk_create | drawing_objects_bulk_create |
| drawings/\<int:drawing_id\>/objects/\<str:object_id\>/ | drawing_object_detail       | drawing_object_detail       |
| legacy/routes/                                         | RouteListView               | route_list                  |
| legacy/routes/create/                                  | RouteCreateView             | route_create                |
| legacy/routes/\<int:pk\>/                              | RouteDetailView             | route_detail                |
| legacy/routes/\<int:pk\>/delete/                       | RouteDeleteView             | route_delete                |
| legacy/routes/\<int:route_id\>/add_point/              | add_point                   | add_point                   |
| legacy/routes/\<int:route_id\>/add_edge/               | add_edge                    | add_edge                    |
| legacy/routes/\<int:route_id\>/export/latex/           | export_latex                | export_latex                |
| legacy/routes/\<int:route_id\>/export/png/             | export_png                  | export_png                  |
| legacy/routes/\<int:route_id\>/update_style/           | update_route_style          | update_route_style          |
| legacy/points/\<int:pk\>/delete/                       | delete_point                | delete_point                |
| legacy/edges/\<int:pk\>/delete/                        | delete_edge                 | delete_edge                 |

## 6.2. Widoki i API

| **Rodzaj**  | **Nazwa**                                  | **Linia** |
|-------------|--------------------------------------------|-----------|
| FunctionDef | \_deep_merge_settings                      | 57        |
| FunctionDef | \_coerce_bool                              | 69        |
| FunctionDef | \_coerce_int                               | 75        |
| FunctionDef | normalized_drawing_settings                | 83        |
| FunctionDef | \_validate_drawing_settings_payload        | 102       |
| FunctionDef | \_serialize_drawing_object                 | 124       |
| FunctionDef | \_parse_json_body                          | 139       |
| FunctionDef | \_validate_object_payload                  | 156       |
| FunctionDef | \_validate_plot_axis                       | 193       |
| FunctionDef | \_validate_plot_series_dict                | 219       |
| FunctionDef | \_validate_plot_function_dict              | 248       |
| FunctionDef | \_validate_object_references               | 275       |
| FunctionDef | drawing_mode_allowed_types                 | 436       |
| FunctionDef | \_validate_object_allowed_for_drawing_mode | 440       |
| FunctionDef | \_tikz_safe_identifier                     | 448       |
| FunctionDef | \_tikz_coord_from_svg                      | 458       |
| FunctionDef | \_format_tikz_number                       | 467       |
| FunctionDef | \_tikz_point_reference_map                 | 472       |
| FunctionDef | build_drawing_tikz                         | 482       |
| FunctionDef | build_drawing_json_document                | 1023      |
| FunctionDef | \_validate_import_document                 | 1044      |
| FunctionDef | import_drawing_from_document               | 1092      |
| FunctionDef | register                                   | 1149      |
| ClassDef    | RouteListView                              | 1160      |
| ClassDef    | RouteCreateView                            | 1168      |
| ClassDef    | RouteDetailView                            | 1181      |
| ClassDef    | DrawingListView                            | 1195      |
| ClassDef    | DrawingCreateView                          | 1205      |
| ClassDef    | DrawingDetailView                          | 1224      |
| FunctionDef | duplicate_drawing                          | 1259      |
| ClassDef    | DrawingDeleteView                          | 1285      |
| FunctionDef | export_drawing_tikz                        | 1296      |
| FunctionDef | drawing_tikz_preview                       | 1307      |
| FunctionDef | export_drawing_json                        | 1320      |
| FunctionDef | import_drawing_image                       | 1332      |
| FunctionDef | import_drawing_json                        | 1390      |
| FunctionDef | drawing_settings_api                       | 1432      |
| FunctionDef | drawing_objects_collection                 | 1463      |
| FunctionDef | \_creation_reference_ids                   | 1532      |
| FunctionDef | \_resolve_creation_references              | 1549      |
| FunctionDef | \_order_creation_payloads                  | 1562      |
| FunctionDef | drawing_objects_bulk_create                | 1614      |
| FunctionDef | drawing_object_detail                      | 1694      |
| ClassDef    | RouteDeleteView                            | 1761      |
| FunctionDef | delete_point                               | 1778      |
| FunctionDef | \_wants_json                               | 1792      |
| FunctionDef | add_point                                  | 1800      |
| FunctionDef | delete_edge                                | 1849      |
| FunctionDef | add_edge                                   | 1857      |
| FunctionDef | update_route_style                         | 1918      |
| FunctionDef | export_png                                 | 1932      |
| FunctionDef | export_latex                               | 1997      |

## 6.3. Walidacja

- Normalizacja ustawień rysunku i głębokie scalanie wartości domyślnych.

- Walidacja typów prostych: wartości logiczne, liczby całkowite i JSON.

- Walidacja danych serii wykresu, funkcji i osi.

- Walidacja referencji pomiędzy obiektami.

- Walidacja dozwolonych typów w zależności od trybu rysunku.

- Walidacja zarejestrowanych typów pluginowych.

- Walidacja komend konstrukcyjnych po stronie serwera.

## 6.4. Operacje masowe i atomowość

Endpoint bulk służy do tworzenia pakietów obiektów, np. punktu zależnego wraz z obiektami pomocniczymi. Serwer wyznacza referencje tworzenia, porządkuje payloady topologicznie, rozwiązuje odwołania i zapisuje cały pakiet jako jedną transakcję. Dzięki temu rysunek nie pozostaje w połowicznie utworzonym stanie.

# 7. Edytor po stronie klienta

## 7.1. Aktywne skrypty

| **Plik**                             | **Rola**                                                          |
|--------------------------------------|-------------------------------------------------------------------|
| tool_registry_krok90.js              | Definicje narzędzi dostępnych w trybach graf, geometria i wykres. |
| geometry_command_registry.js         | Klienckie obliczanie konstrukcji zależnych.                       |
| ratio_point_plugin.js                | Przykład pluginu tworzącego punkt w zadanym stosunku.             |
| drawing_editor_krok90_labels_text.js | Główna klasa DrawingEditor i kompletna logika interfejsu.         |

## 7.2. Rejestr narzędzi

| **Identyfikator narzędzia**         | **Kategoria** |
|-------------------------------------|---------------|
| select                              | ogólne        |
| text.latex                          | text          |
| label.relative                      | label         |
| graph.vertex                        | graph         |
| graph.edge.undirected               | graph         |
| graph.edge.directed                 | graph         |
| geometry.point                      | geometry      |
| geometry.midpoint                   | geometry      |
| geometry.line_intersection          | geometry      |
| geometry.perpendicular_projection   | geometry      |
| geometry.segment_projection         | geometry      |
| geometry.circle_nearest_point       | geometry      |
| geometry.line_circle_intersection   | geometry      |
| geometry.circle_circle_intersection | geometry      |
| geometry.circumcenter               | geometry      |
| geometry.orthocenter                | geometry      |
| geometry.nine_point_center          | geometry      |
| geometry.centroid                   | geometry      |
| geometry.incenter                   | geometry      |
| geometry.excenter                   | geometry      |
| geometry.reflection_across_line     | geometry      |
| geometry.rotation_around_point      | geometry      |
| geometry.central_reflection         | geometry      |
| geometry.homothety                  | geometry      |
| geometry.translation_by_vector      | geometry      |
| geometry.segment                    | geometry      |
| geometry.circle                     | geometry      |
| geometry.polygon                    | geometry      |
| plot.chart                          | plot          |

## 7.3. Model interakcji

- Tryb zaznaczania pojedynczego i prostokątnego.

- Obsługa kliknięć, przeciągania i podwójnego kliknięcia.

- Tworzenie obiektów wieloetapowych, np. krawędzi, okręgu i wielokąta.

- Przesuwanie obiektów definiujących oraz przeliczanie potomków.

- Panel właściwości dla pojedynczego obiektu i zaznaczenia wielokrotnego.

- Lista obiektów z widocznością, kolejnością i akcjami.

- Historia undo/redo zapisywana lokalnie i uzgadniana ze stanem serwera.

- Eksport SVG i PNG wykonywany w przeglądarce.

## 7.4. Renderowanie SVG

Każdy typ obiektu ma rozpoznawalną reprezentację. Punkty są renderowane jako okręgi SVG, odcinki i krawędzie jako linie lub ścieżki, okręgi jako circle, wielokąty jako polygon, a tekst jako elementy text. Style są nakładane przez funkcje wspólne dla obrysu, wypełnienia i tekstu. Widoczność obiektów pomocniczych jest kontrolowana niezależnie.

# 8. Katalog funkcjonalności

## 8.1. Zarządzanie użytkownikiem i dokumentami

- Rejestracja, logowanie i wylogowanie przez mechanizmy Django.

- Lista rysunków użytkownika.

- Tworzenie rysunku w jednym z trzech trybów.

- Usuwanie i duplikowanie rysunku.

- Automatyczna kontrola własności obiektu przez użytkownika.

## 8.2. Zaznaczanie i edycja

- Zaznaczenie kliknięciem i zaznaczenie prostokątne.

- Wielokrotne zaznaczenie oraz wspólna zmiana stylu.

- Przesuwanie, duplikowanie i usuwanie obiektów.

- Zmiana kolejności obiektów.

- Ukrywanie i pokazywanie obiektów.

- Historia cofania i ponawiania.

## 8.3. Ustawienia rysunku

- Siatka i jej parametry.

- Przyciąganie do siatki.

- Domyślne style dla nowo tworzonych obiektów.

- Zapamiętywanie ustawień w polu JSON modelu Drawing.

## 8.4. Grafy

- Wierzchołki z etykietami.

- Krawędzie nieskierowane.

- Krawędzie skierowane ze znacznikiem strzałki.

- Tworzenie krawędzi wyłącznie pomiędzy istniejącymi wierzchołkami.

- Relatywne położenie etykiet względem obiektu.

## 8.5. Geometria podstawowa

- Punkt swobodny.

- Odcinek z automatycznie tworzonymi lub wskazywanymi końcami.

- Okrąg definiowany środkiem i promieniem/punktem.

- Wielokąt tworzony kolejnymi kliknięciami i zamykany podwójnym kliknięciem.

- Linie pomocnicze i punkty zależne.

## 8.6. Tekst i etykiety

- Obiekt tekstowy z zapisem LaTeX.

- Etykieta względna przypięta do obiektu.

- Sterowanie rozmiarem, kolorem i pozycją tekstu.

- Prosta transformacja zapisu LaTeX do prezentacji SVG.

## 8.7. Wykresy

- Jeden obiekt wykresu zawierający wiele serii.

- Serie danych punktowych i liniowych.

- Funkcje matematyczne.

- Osie OX i OY pozycjonowane zgodnie z zakresem danych.

- Legenda, kolory, style linii i punktów.

- Niepewności/błędy w kierunku x i y.

- Panel danych pod obszarem rysunku.

# 9. Konstrukcje geometryczne i zależności

Konstrukcje zależne są reprezentowane jako obiekty, których położenie wynika z referencji do innych obiektów. Dzięki temu przesunięcie punktu bazowego prowadzi do ponownego obliczenia całego łańcucha zależności.

| **Komenda**                | **Znaczenie**                                       |
|----------------------------|-----------------------------------------------------|
| midpoint                   | Środek odcinka.                                     |
| line_intersection          | Punkt przecięcia dwóch prostych.                    |
| perpendicular_projection   | Rzut prostopadły punktu na prostą.                  |
| segment_projection         | Rzut punktu ograniczony do odcinka.                 |
| circle_nearest_point       | Najbliższy punkt okręgu względem wskazanego punktu. |
| line_circle_intersection   | Jeden z punktów przecięcia prostej i okręgu.        |
| circle_circle_intersection | Jeden z punktów przecięcia dwóch okręgów.           |
| circumcenter               | Środek okręgu opisanego na trójkącie.               |
| orthocenter                | Ortocentrum trójkąta.                               |
| nine_point_center          | Środek okręgu dziewięciu punktów.                   |
| centroid                   | Środek ciężkości trójkąta.                          |
| incenter                   | Środek okręgu wpisanego.                            |
| excenter                   | Środek okręgu dopisanego.                           |
| incircle_touchpoint        | Punkt styczności okręgu wpisanego z bokiem.         |
| excircle_touchpoint        | Punkt styczności okręgu dopisanego.                 |
| reflection_across_line     | Odbicie osiowe punktu względem prostej.             |
| rotation_around_point      | Obrót punktu wokół środka o zadany kąt.             |
| central_reflection         | Symetria środkowa.                                  |
| homothety                  | Jednokładność o zadanym środku i skali.             |
| translation_by_vector      | Przesunięcie o wektor.                              |
| ratio_point                | Punkt dzielący odcinek w zadanym stosunku; plugin.  |

## 9.1. Mechanizm zależności

- dependency_ids_for_payload odczytuje identyfikatory zależności z danych obiektu.

- dependent_objects wyszukuje bezpośrednich potomków.

- dependency_closure wyznacza domknięcie zależności.

- dependency_order wyznacza kolejność bezpiecznego przeliczania.

- remap_dependency_ids podmienia identyfikatory podczas duplikowania.

- object_tree umożliwia przejście po obiektach złożonych i grupach.

## 9.2. Obsługa przypadków zdegenerowanych

Walidatory i resolvery powinny odrzucać lub bezpiecznie obsługiwać sytuacje takie jak: proste równoległe, trzy punkty współliniowe, okręgi bez punktów wspólnych, zerowy promień, zerowa długość wektora i niepoprawne referencje. Jest to szczególnie ważne, ponieważ błąd w obiekcie bazowym może propagować się do wielu konstrukcji potomnych.

# 10. Architektura pluginów i rozszerzalność

## 10.1. Rejestr typów obiektów

object_type_registry.py definiuje ObjectTypeDefinition oraz funkcje rejestracji, walidacji, rozwiązywania pozycji i renderowania TikZ. Typ pluginowy może dzięki temu uczestniczyć w walidacji serwerowej i eksporcie tak samo jak typ wbudowany.

## 10.2. Rejestr komend geometrycznych

geometry_command_registry.py oddziela definicję komendy od widoku API. Każda komenda ma identyfikator, wynikowy typ obiektu, wymagania dotyczące referencji i walidator. Analogiczny rejestr w JavaScript umożliwia natychmiastowe przeliczanie po stronie klienta.

## 10.3. Rejestr narzędzi

ToolRegistry po stronie klienta przechowuje metadane narzędzi: identyfikator, etykietę, tryb, ikonę/rodzaj oraz sposób aktywacji. Dzięki temu panel narzędzi nie musi być zakodowany jako duży blok warunków.

## 10.4. Przykładowy plugin ratio point

ratio_point_plugin.js pokazuje pełną ścieżkę rozszerzenia: dodanie narzędzia, zebranie parametru stosunku, wskazanie punktów bazowych, utworzenie obiektu zależnego oraz obsługę w rejestrze serwerowym. Jest to wzorzec dla kolejnych konstrukcji.

# 11. Import obrazu i moduł rozpoznawania

## 11.1. Cel

Moduł ma zamieniać obraz rysunku — zrzut ekranu lub prosty szkic — na edytowalny dokument strukturalny. Nie jest to klasyfikacja obrazu, lecz rekonstrukcja geometrii i topologii.

## 11.2. Pipeline kroku 91

9.  Odczyt przesłanego obrazu i dekodowanie do tablicy pikseli.

10. Wykrywanie wypełnionych punktów na podstawie progowania i konturów.

11. Deduplikacja bliskich kandydatów.

12. Badanie ciemności odcinka pomiędzy parami punktów.

13. Wykrywanie segmentów wspartych ciemnymi pikselami.

14. Wykrywanie okręgów poprzez ocenę wsparcia obwodu.

15. Wygenerowanie obrazu z naniesionymi wynikami detekcji.

16. Prezentacja formularza przeglądu, w którym użytkownik zatwierdza lub poprawia wynik.

17. Konwersja zatwierdzonego grafu do dokumentu Drawing/DrawingObject.

## 11.3. Pliki modułu

| **Plik**                                         | **Rola**                                           |
|--------------------------------------------------|----------------------------------------------------|
| routes/image_recognition_import.py               | Integracja rozpoznawania z widokiem Django.        |
| experiments/image_recognition/detect_vertices.py | Eksperymentalna detekcja wierzchołków.             |
| detect_edges.py                                  | Detekcja krawędzi.                                 |
| detect_labels.py                                 | Próby OCR etykiet.                                 |
| reconstruct_graph.py                             | Rekonstrukcja grafu.                               |
| to_route_editor.py                               | Konwersja wyników do formatu aplikacji.            |
| run_experiment.py                                | Uruchamianie eksperymentów i raportowanie wyników. |
| samples/                                         | Obrazy testowe i ground truth.                     |
| results/                                         | Wyniki JSON i obrazy anotowane.                    |

## 11.4. Ograniczenia obecnego podejścia

- Algorytm jest regułowy, więc jest wrażliwy na szum, perspektywę i nierówne oświetlenie.

- Wykrywanie odręcznych punktów i linii wymaga tolerancji na nieregularne kształty.

- OCR wymaga zainstalowanego zewnętrznego programu Tesseract, nie tylko biblioteki pytesseract.

- Rozpoznanie obiektu nie gwarantuje poprawnej interpretacji semantycznej.

- Konieczny jest etap zatwierdzenia przez użytkownika.

## 11.5. Zalecany kierunek rozwoju AI

- Normalizacja perspektywy i korekcja oświetlenia.

- Segmentacja linii i punktów z wykorzystaniem sieci neuronowej lub modelu detekcyjnego.

- Osobny model OCR dla krótkich etykiet matematycznych.

- Budowa zbioru syntetycznego generowanego z samego Route Editora.

- Uczenie z aktywną korektą użytkownika.

- Metryki: precision/recall punktów i krawędzi, odległość geometryczna, poprawność topologii.

# 12. Import i eksport

## 12.1. JSON

JSON jest formatem pełnej wymiany danych. Dokument obejmuje metadane rysunku, tryb, ustawienia i uporządkowaną listę obiektów. Import przechodzi walidację całego dokumentu przed utworzeniem rekordów. Format jest kluczowy dla kopii zapasowych, migracji i testów.

## 12.2. TikZ

build_drawing_tikz generuje kod LaTeX/TikZ. Serwer mapuje współrzędne SVG, bezpiecznie tworzy identyfikatory, formatuje liczby i renderuje typy wbudowane oraz pluginowe. Dla wykresów możliwa jest reprezentacja pgfplots.

## 12.3. SVG i PNG

SVG jest serializowany bezpośrednio z aktualnego drzewa DOM edytora. PNG powstaje przez narysowanie SVG na elemencie canvas i zapis bitmapy. Mechanizm ten zachowuje wygląd interfejsu, ale wymaga szczególnej obsługi fontów, markerów strzałek i tekstu LaTeX.

# 13. Testy i jakość

Plik routes/tests.py ma około 5306 linii. Statycznie wykryto 66 klas testowych i 376 metod zaczynających się od test\_.

| **Klasa testowa**                                 | **Liczba testów** | **Przykładowe metody**                                                                                                                                                                                                                                                                                      |
|---------------------------------------------------|-------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| RouteViewsTests                                   | 11                | test_route_list_contains_only_current_user_routes, test_route_detail_is_restricted_to_owner, test_add_point_ajax_returns_json_and_creates_point, test_add_point_rejects_invalid_coordinates_for_ajax, test_add_edge_creates_edge_for_points_from_same_route…                                                |
| DrawingModelAndViewTests                          | 62                | test_drawing_can_store_structured_objects, test_drawing_object_ids_must_be_unique_inside_one_drawing, test_deleting_drawing_deletes_its_objects, test_drawing_list_contains_only_current_user_drawings, test_drawing_detail_is_restricted_to_owner…                                                         |
| DrawingEditorRectangleSelectionTests              | 2                 | test_drawing_editor_static_js_contains_rectangle_selection_support, test_drawing_editor_static_css_contains_rectangle_selection_styles                                                                                                                                                                      |
| DrawingSettingsAndSnapTests                       | 7                 | test_drawing_has_settings_json_field, test_drawing_settings_api_gets_and_updates_settings, test_drawing_settings_api_is_restricted_to_owner, test_drawing_detail_contains_settings_controls, test_drawing_export_tikz_uses_drawing_settings_scale_and_height…                                               |
| DrawingCircleObjectTests                          | 4                 | test_api_can_store_geometry_circle_dependent_on_two_points, test_drawing_detail_contains_geometry_circle_tool, test_drawing_editor_static_js_contains_circle_support, test_drawing_export_tikz_exports_geometry_circle                                                                                      |
| DrawingPolygonObjectTests                         | 4                 | test_api_can_store_geometry_polygon_dependent_on_points, test_drawing_detail_contains_geometry_polygon_tool_without_finish_buttons, test_drawing_editor_static_js_contains_polygon_support, test_drawing_export_tikz_exports_geometry_polygon                                                               |
| DrawingObjectTypeSeparationTests                  | 6                 | test_geometry_circle_rejects_graph_vertex_as_reference, test_geometry_polygon_rejects_graph_vertex_as_point, test_graph_edge_rejects_geometry_point_as_endpoint, test_frontend_contains_automatic_circle_and_polygon_point_creation, test_frontend_contains_step21_segment_autocreate_and_graph_edge_tools… |
| MainNavigationCleanupTests                        | 3                 | test_home_page_is_drawing_list, test_main_navigation_shows_only_drawing_links, test_legacy_route_editor_still_has_urls_but_is_hidden_from_menu                                                                                                                                                              |
| DrawingToolboxUiTests                             | 4                 | test_drawing_detail_contains_grouped_toolbox, test_hidden_select_still_exists_as_tool_state_for_frontend, test_drawing_editor_js_syncs_tool_buttons_with_current_tool, test_drawing_editor_css_contains_grouped_toolbox_styles                                                                              |
| DrawingObjectOrderingTests                        | 5                 | test_objects_api_returns_objects_ordered_by_order, test_object_order_can_be_updated_with_patch, test_drawing_detail_contains_ordering_buttons, test_drawing_editor_js_contains_reordering_logic, test_drawing_editor_css_contains_order_label_style                                                         |
| DrawingDependentGeometryPointMovementTests        | 2                 | test_drawing_editor_js_renders_dependent_shapes_before_control_points, test_drawing_editor_switches_to_select_after_geometry_creation                                                                                                                                                                       |
| DrawingModeToolAvailabilityTests                  | 19                | test_create_drawing_form_explains_modes, test_create_drawing_form_rejects_mixed_mode, test_graph_mode_shows_only_graph_tools, test_geometry_mode_shows_only_geometry_tools, test_plot_mode_shows_plot_tools_without_graph_or_geometry_tools…                                                                |
| PlotPanelUxStep27Tests                            | 3                 | test_plot_data_panel_is_below_canvas_not_in_side_panel, test_plot_panel_explains_empty_data_removes_plot, test_drawing_editor_js_syncs_plot_series_from_textarea                                                                                                                                            |
| PlotChartStep29Tests                              | 4                 | test_plot_mode_allows_plot_chart_object, test_plot_chart_rejects_invalid_series_point, test_plot_chart_exports_multiple_series_and_function, test_plot_panel_contains_multiple_series_and_function_controls                                                                                                 |
| DrawingJsonImportExportStep30Tests                | 6                 | test_export_drawing_json_contains_structural_document, test_export_drawing_json_rejects_other_users_drawing, test_import_drawing_json_creates_new_drawing_and_objects, test_import_drawing_json_rejects_invalid_mode, test_import_drawing_json_rejects_geometry_reference_to_graph_vertex…                  |
| DrawingDetailCleanUiTests                         | 4                 | test_drawing_detail_hides_developer_notes_and_metadata, test_drawing_detail_does_not_show_refresh_button, test_drawing_detail_has_simplified_export_section, test_drawing_editor_js_has_no_refresh_button_handler                                                                                           |
| DrawingEditorDrawerStep35Tests                    | 4                 | test_drawing_detail_contains_tabbed_edit_drawer, test_drawing_editor_js_supports_edit_drawer_tabs_and_auto_open, test_drawing_editor_js_hides_irrelevant_style_fields, test_drawing_editor_css_contains_drawer_tab_styles                                                                                   |
| DrawingEditorSvgPngExportStep36Tests              | 2                 | test_drawing_detail_contains_svg_and_png_export_buttons, test_drawing_editor_js_supports_svg_and_png_downloads                                                                                                                                                                                              |
| DrawingEditorAdvancedStyleStep37Tests             | 3                 | test_drawing_detail_contains_advanced_style_controls, test_drawing_editor_js_supports_label_positions_and_line_styles, test_tikz_export_contains_dashed_opacity_and_relative_label_position                                                                                                                 |
| DrawingStep39DuplicateVisibilityObjectListTests   | 6                 | test_drawing_list_contains_duplicate_button, test_duplicate_drawing_copies_settings_and_objects, test_other_user_cannot_duplicate_drawing, test_hidden_object_is_not_rendered_in_tikz_but_exported_json_keeps_visibility, test_drawing_detail_contains_visibility_control_and_improved_object_list_hooks…   |
| DrawingStep40PlotImprovementsTests                | 4                 | test_plot_chart_accepts_points_with_measurement_uncertainties, test_tikz_export_uses_pgfplots_error_bars_and_continuous_functions, test_drawing_editor_js_supports_dynamic_plot_axes_and_error_bars, test_plot_ui_mentions_error_bar_format_and_samples                                                     |
| RelativeLabelStep41Tests                          | 5                 | test_api_creates_relative_label_for_vertex, test_relative_label_rejects_missing_or_wrong_base, test_tikz_export_resolves_relative_label_position, test_deleting_base_object_deletes_dependent_relative_label, test_editor_exposes_relative_label_tool_and_logic                                             |
| ObjectDependenciesStep42Tests                     | 5                 | test_serialized_object_exposes_dependencies, test_delete_response_contains_dependency_cascade, test_dependency_registry_supports_existing_structural_types, test_dependency_closure_supports_multiple_levels, test_editor_contains_generic_dependency_resolver                                              |
| ApplyToSelectionStep43Tests                       | 3                 | test_editor_contains_generic_apply_to_selection, test_style_content_and_visibility_use_apply_to_selection, test_frontend_dependency_removal_is_generic                                                                                                                                                      |
| DuplicateDependenciesStep44Tests                  | 4                 | test_remap_dependency_ids_updates_scalar_and_list_references, test_dependency_order_places_dependencies_before_dependents, test_editor_duplicates_with_id_map_and_dependency_order, test_editor_rolls_back_partial_duplicate_on_error                                                                       |
| DuplicateHistoryStep44Tests                       | 1                 | test_bulk_create_undo_removes_copies_in_reverse_dependency_order                                                                                                                                                                                                                                            |
| ObjectTraversalStep45Tests                        | 4                 | test_backend_walks_nested_composite_depth_first, test_backend_walk_prevents_recursive_cycle, test_editor_contains_generic_tree_traversal_layer, test_rendering_selection_dependencies_and_list_use_flattened_structure                                                                                      |
| CompositeGroupStep46Tests                         | 5                 | test_group_object_can_reference_existing_children, test_group_rejects_missing_child, test_group_rejects_duplicate_children, test_editor_exposes_group_and_ungroup_actions, test_editor_contains_composite_group_helpers                                                                                     |
| MidpointCommandStep48Tests                        | 5                 | test_midpoint_command_can_be_created_from_two_geometry_points, test_midpoint_rejects_same_input_twice, test_midpoint_rejects_graph_vertex_inputs, test_tikz_exports_computed_midpoint_coordinate, test_editor_exposes_midpoint_command_and_dynamic_resolver                                                 |
| ToolRegistryStep49Tests                           | 5                 | test_tool_registry_static_file_exists_and_exposes_public_api, test_tool_registry_registers_core_midpoint_tool, test_editor_loads_registry_before_main_editor_script, test_editor_installs_registered_tools_and_plugin_canvas_handlers, test_registry_rejects_duplicate_tools_and_supports_modes             |
| RatioPointPluginStep50Tests                       | 5                 | test_ratio_point_can_be_created_and_reports_dependencies, test_ratio_point_rejects_ratio_outside_unit_interval, test_ratio_point_rejects_same_source_and_target, test_tikz_exports_computed_ratio_point, test_ratio_point_plugin_is_loaded_between_registry_and_editor                                      |
| ExtensibleObjectTypeRegistryStep51Tests           | 5                 | test_backend_registry_contains_ratio_point_capabilities, test_ratio_point_is_not_hardcoded_in_dependency_fields, test_frontend_registry_exposes_object_type_api, test_ratio_plugin_registers_its_object_type_and_resolver, test_editor_uses_registered_object_type_instead_of_ratio_special_case            |
| PluginRenderingStep52Tests                        | 5                 | test_backend_definition_exposes_tikz_renderer, test_ratio_point_tikz_uses_plugin_shape, test_registry_validates_frontend_render_callback, test_editor_invokes_plugin_renderer_before_core_dispatch, test_ratio_plugin_supplies_custom_svg_renderer                                                          |
| PluginPropertiesStep53Tests                       | 4                 | test_registry_validates_property_fields, test_ratio_plugin_declares_editable_ratio_and_label, test_template_contains_plugin_property_panel, test_editor_builds_and_saves_plugin_property_form                                                                                                               |
| PluginObjectActionsStep54Tests                    | 4                 | test_registry_validates_object_actions, test_template_contains_plugin_actions_panel, test_editor_builds_and_runs_plugin_actions, test_ratio_plugin_supplies_midpoint_and_swap_actions                                                                                                                       |
| PluginMultiObjectActionsStep55Tests               | 4                 | test_registry_validates_multi_action_contract, test_editor_resolves_action_for_homogeneous_selection, test_editor_uses_apply_to_selection_for_plugin_action, test_ratio_actions_support_multiple_objects                                                                                                    |
| PluginCreateObjectsActionsStep56Tests             | 3                 | test_registry_validates_creates_objects_flag, test_editor_exposes_atomic_create_objects_helper, test_ratio_plugin_creates_mirrored_points                                                                                                                                                                   |
| PluginDependentCreatePackagesStep57Tests          | 2                 | test_editor_resolves_local_creation_references, test_ratio_plugin_creates_point_and_relative_label_package                                                                                                                                                                                                  |
| PluginCreationDependencyOrderingStep58Tests       | 2                 | test_editor_orders_plugin_payloads_topologically, test_ratio_plugin_demonstrates_forward_reference                                                                                                                                                                                                          |
| PluginAtomicBulkCreateStep59Tests                 | 4                 | test_bulk_endpoint_resolves_forward_references_atomically, test_invalid_second_object_rolls_back_entire_package, test_bulk_endpoint_detects_cycles_before_creating_objects, test_frontend_uses_single_bulk_request                                                                                          |
| PersistentHistoryStep60Tests                      | 3                 | test_editor_persists_and_restores_history, test_history_is_versioned_and_sanitized, test_undo_and_redo_persist_updated_stacks                                                                                                                                                                               |
| ReconciledPersistentHistoryStep61Tests            | 3                 | test_editor_reconciles_history_after_loading_objects, test_reconciliation_compares_snapshots_and_simulates_commands, test_undo_and_redo_recheck_current_state                                                                                                                                               |
| ImageRecognitionImportStep64Tests                 | 4                 | test_image_import_page_is_linked_and_requires_login, test_preview_uses_recognizer_and_shows_review_controls, test_confirm_import_respects_reviewed_vertices_edges_and_labels, test_review_helper_drops_edges_to_rejected_vertices                                                                           |
| GeometryCommandRegistryStep65Tests                | 5                 | test_backend_registry_contains_midpoint_and_ratio_point, test_geometry_command_registry_rejects_duplicate_ids, test_frontend_registry_is_loaded_before_plugin_and_editor, test_ratio_plugin_registers_command_contract, test_midpoint_tool_points_to_registered_command                                     |
| Step66LineIntersectionTests                       | 6                 | test_registry_contains_line_intersection, test_line_intersection_can_be_created_and_reports_dependencies, test_line_intersection_rejects_wrong_input_type, test_position_resolver_computes_crossing, test_tikz_exports_line_intersection…                                                                   |
| Step67PerpendicularProjectionTests                | 6                 | test_registry_contains_projection_command_and_type, test_projection_can_be_created_and_reports_dependencies, test_projection_rejects_degenerate_line, test_position_resolver_computes_orthogonal_projection, test_frontend_registers_projection_workflow…                                                   |
| Step68ReflectionAcrossLineTests                   | 6                 | test_registry_contains_reflection_command_and_type, test_reflection_can_be_created_and_reports_dependencies, test_reflection_rejects_degenerate_line, test_position_resolver_reflects_point_across_horizontal_line, test_frontend_registers_reflection_workflow…                                            |
| Step69RotationAroundPointTests                    | 6                 | test_registry_contains_rotation_command_and_type, test_rotation_can_be_created_and_reports_dependencies, test_rotation_rejects_non_numeric_angle, test_position_resolver_rotates_ninety_degrees, test_frontend_registers_rotation_workflow…                                                                 |
| Step70TranslationByVectorTests                    | 6                 | test_registry_contains_translation_command_and_type, test_translation_can_be_created_and_reports_dependencies, test_translation_rejects_repeated_vector_points, test_position_resolver_adds_vector, test_frontend_registers_translation_workflow…                                                           |
| Step71CentralReflectionTests                      | 6                 | test_registry_contains_central_reflection_command_and_type, test_central_reflection_can_be_created_and_reports_dependencies, test_central_reflection_rejects_same_point_and_center, test_position_resolver_reflects_through_center, test_frontend_registers_central_reflection_workflow…                    |
| Step72HomothetyTests                              | 5                 | test_registry_contains_homothety_command_and_type, test_homothety_can_be_created_and_reports_dependencies, test_homothety_rejects_invalid_scale, test_homothety_resolver_computes_expected_position, test_frontend_registers_homothety_workflow                                                             |
| Step73SegmentProjectionTests                      | 7                 | test_registry_contains_segment_projection_command_and_type, test_segment_projection_can_be_created_and_reports_dependencies, test_segment_projection_rejects_repeated_inputs, test_resolver_projects_inside_segment, test_resolver_clamps_projection_to_endpoint…                                           |
| CircleNearestPointStep74Tests                     | 6                 | test_registry_contains_circle_nearest_point, test_circle_nearest_point_can_be_created, test_circle_nearest_point_resolver, test_circle_nearest_point_rejects_repeated_inputs, test_frontend_registers_circle_nearest_point…                                                                                 |
| LineCircleIntersectionStep75Tests                 | 7                 | test_registry_contains_line_circle_intersection, test_line_circle_intersection_can_be_created, test_line_circle_intersection_rejects_invalid_branch, test_resolver_returns_two_intersections, test_resolver_handles_tangent…                                                                                |
| CircleCircleIntersectionStep76Tests               | 6                 | test_registry_contains_circle_circle_intersection, test_circle_circle_intersection_can_be_created, test_resolver_returns_two_intersections, test_resolver_handles_tangent, test_frontend_registers_circle_circle_intersection…                                                                              |
| CircumcenterStep77Tests                           | 7                 | test_registry_contains_circumcenter, test_circumcenter_can_be_created, test_circumcenter_resolver, test_circumcenter_resolver_returns_none_for_collinear_points, test_frontend_registers_circumcenter…                                                                                                      |
| OrthocenterStep78Tests                            | 6                 | test_registry_contains_orthocenter, test_orthocenter_can_be_created, test_orthocenter_resolver, test_orthocenter_resolver_returns_none_for_collinear_points, test_frontend_registers_orthocenter…                                                                                                           |
| CentroidStep79Tests                               | 5                 | test_registry_contains_centroid, test_centroid_can_be_created, test_centroid_resolver, test_frontend_registers_centroid_and_orthocenter_handler, test_tikz_exports_centroid                                                                                                                                 |
| IncenterStep80Tests                               | 6                 | test_registry_contains_incenter, test_incenter_can_be_created, test_incenter_resolver, test_incenter_is_hidden_for_collinear_points, test_frontend_registers_incenter…                                                                                                                                      |
| IncircleTouchpointStep81Tests                     | 6                 | test_registry_contains_incircle_touchpoint, test_touchpoint_can_be_created, test_touchpoint_rejects_invalid_side, test_touchpoint_on_ab, test_frontend_registers_incircle_touchpoint…                                                                                                                       |
| ExcenterStep82Tests                               | 6                 | test_registry_contains_excenter, test_excenter_can_be_created, test_excenter_rejects_invalid_vertex, test_a_excenter_for_6_8_10_triangle, test_frontend_registers_excenter…                                                                                                                                 |
| ExcircleTouchpointStep83Tests                     | 6                 | test_registry_contains_excircle_touchpoint, test_excircle_touchpoint_can_be_created, test_excircle_touchpoint_rejects_invalid_parameters, test_a_excircle_touchpoint_on_bc_for_6_8_10_triangle, test_frontend_registers_excircle_touchpoint…                                                                |
| NinePointCenterStep84Tests                        | 5                 | test_registry_contains_nine_point_center, test_nine_point_center_can_be_created, test_nine_point_center_for_6_8_10_triangle, test_frontend_registers_nine_point_center, test_tikz_exports_nine_point_center                                                                                                 |
| Step86ConstructedPointsAndDeletionRegressionTests | 3                 | test_segment_accepts_constructed_point_as_endpoint, test_polygon_accepts_constructed_points, test_frontend_delete_skips_objects_already_removed_by_cascade                                                                                                                                                  |
| Step90LabelsAndTextRegressionTests                | 2                 | test_geometry_mode_accepts_latex_text_object, test_relative_label_accepts_constructed_point                                                                                                                                                                                                                 |
| ImageRecognitionStep91Tests                       | 2                 | test_route_editor_screenshot_detects_points_segments_and_circle, test_step91_converter_creates_geometry_objects                                                                                                                                                                                             |

## 13.1. Zakres testów

- Modele i uprawnienia użytkowników.

- Widoki listy, tworzenia, szczegółów i usuwania.

- API obiektów oraz ustawień.

- Walidacja trybów i typów.

- Import/eksport JSON i TikZ.

- Elementy interfejsu wykrywane w HTML/JS.

- Zależności i duplikowanie.

- Pluginy i rejestry.

- Wszystkie kolejne konstrukcje geometryczne.

- Regresje usuwania, etykiet, tekstu oraz importu obrazu.

## 13.2. Status uruchomienia testów w środowisku dokumentacyjnym

Próba uruchomienia testów zakończyła się przed startem test runnera, ponieważ w środowisku nie było zainstalowanego Django. Próba instalacji zależności została przerwana przez timeout repozytorium pakietów. Nie oznacza to niepowodzenia testów projektu; oznacza jedynie, że w tym środowisku nie udało się ich wykonać. Dokumentacja nie deklaruje zatem wyniku pass/fail.

# 14. Instalacja i uruchomienie

## 14.1. Wymagania

- Python 3.10–3.12 jest bezpiecznym zakresem dla Django 4.2 i podanych bibliotek.

- pip oraz środowisko wirtualne.

- Tesseract OCR w systemie, gdy używany jest OCR.

- Biblioteki systemowe wymagane przez OpenCV/Matplotlib w środowisku bez GUI.

## 14.2. Procedura

> unzip route_editor.zip  
> cd route_editor  
>   
> python -m venv .venv  
> source .venv/bin/activate \# Linux/macOS  
> \# .venv\Scripts\activate \# Windows  
>   
> pip install -r requirements.txt  
> python manage.py migrate  
> python manage.py createsuperuser \# opcjonalnie  
> python manage.py runserver

## 14.3. Testy

> python manage.py test routes  
> python manage.py test routes --verbosity 2

## 14.4. Ważna uwaga o plikach .md

Aplikacja uruchomieniowa nie powinna zależeć od plików README.md ani REPORT.md. W aktualnym archiwum pliki Markdown występują w katalogu eksperymentów i nie są importowane przez kod Django. Jeżeli usunięcie dokumentacji powoduje błąd testów, test powinien zostać zmieniony tak, aby sprawdzał kod/funkcjonalność, a nie obecność dokumentu. Pliki dokumentacyjne nie powinny być częścią krytycznej ścieżki kompilacji.

# 15. Konfiguracja, bezpieczeństwo i wdrożenie

| **Problem**    | **Stan obecny**                                  | **Zalecenie**                                           |
|----------------|--------------------------------------------------|---------------------------------------------------------|
| SECRET_KEY     | Wpisany na stałe w settings.py.                  | Przenieść do zmiennej środowiskowej.                    |
| DEBUG          | True.                                            | Wyłączyć w produkcji.                                   |
| ALLOWED_HOSTS  | Pusta lista.                                     | Ustawić domeny produkcyjne.                             |
| Baza           | SQLite.                                          | Dla wdrożenia wieloużytkownikowego rozważyć PostgreSQL. |
| Pliki media    | Lokalny katalog media.                           | Skonfigurować trwały storage i serwowanie.              |
| CSP/XSS        | Tekst i LaTeX są renderowane po stronie klienta. | Audyt sanitizacji i polityki CSP.                       |
| Limity uploadu | Brak jawnych limitów w settings.py.              | Dodać limity rozmiaru i wymiarów obrazu.                |
| OCR/OpenCV     | Przetwarzanie synchroniczne.                     | Dla dużych zadań kolejka zadań i timeouty.              |

# 16. Ograniczenia i dług techniczny

- Główny plik JavaScript ma ponad 6500 linii i powinien zostać rozdzielony na moduły.

- W repozytorium znajdują się równoległe wersje skryptów kroków 88–90; aktywna wersja powinna być jednoznacznie wskazana lub stare pliki przeniesione do archiwum.

- Istnieją dwie domeny danych: legacy Route oraz Drawing. Należy zdefiniować plan migracji lub usunięcia legacy.

- Konfiguracja settings.py zawiera duplikat STATIC_URL i komentarze deweloperskie.

- Brak jawnej wersji schematu JSON eksportu.

- Konwersja prostego LaTeX do SVG nie jest pełnym silnikiem TeX.

- Import obrazu ma charakter eksperymentalny i wymaga kalibracji na rzeczywistych szkicach.

- Pliki \_\_pycache\_\_ i db.sqlite3 znajdują się w archiwum; nie powinny być częścią czystego pakietu źródłowego.

- Brak pliku .gitignore i jednoznacznej instrukcji produkcyjnej w głównym katalogu.

- Testy UI są w dużej części statycznymi testami zawartości; warto dodać testy przeglądarkowe Playwright/Selenium.

# 17. Rekomendowany plan dalszego rozwoju

| **Priorytet** | **Zadanie**                                                  | **Rezultat**                             |
|---------------|--------------------------------------------------------------|------------------------------------------|
| P0            | Oczyścić repozytorium i ustalić jeden aktywny zestaw plików. | Mniej pomyłek i prostsze wdrożenie.      |
| P0            | Uruchomić pełny test suite w CI.                             | Wiarygodna regresja dla każdego commita. |
| P0            | Usunąć zależność testów od dokumentów .md.                   | Kod działa bez plików dokumentacyjnych.  |
| P1            | Rozbić DrawingEditor na moduły.                              | Czytelność i łatwiejsze rozszerzenia.    |
| P1            | Dodać wersjonowanie formatu JSON.                            | Bezpieczne migracje dokumentów.          |
| P1            | Dodać testy end-to-end.                                      | Sprawdzenie realnych akcji użytkownika.  |
| P1            | Udoskonalić import szkiców.                                  | Większa tolerancja na odręczne rysunki.  |
| P2            | Pełniejsze renderowanie matematyki.                          | Lepszy tekst LaTeX w SVG/PNG.            |
| P2            | Migracja produkcyjna na PostgreSQL i storage.                | Gotowość do wdrożenia.                   |
| P2            | System wersji dokumentu i autosave.                          | Odporność na utratę pracy.               |

# 18. Inwentarz najważniejszych plików

| **Plik/katalog**                                          | **Znaczenie**                               |
|-----------------------------------------------------------|---------------------------------------------|
| manage.py                                                 | Punkt wejścia poleceń Django.               |
| requirements.txt                                          | Lista zależności Pythona.                   |
| route_editor/settings.py                                  | Konfiguracja projektu.                      |
| route_editor/urls.py                                      | Routing globalny i uwierzytelnianie.        |
| routes/models.py                                          | Modele legacy i nowy model strukturalny.    |
| routes/views.py                                           | Widoki, API, walidacja, eksport i import.   |
| routes/urls.py                                            | Routing aplikacji.                          |
| routes/forms.py                                           | Formularze użytkownika i dokumentów.        |
| routes/object_type_registry.py                            | Serwerowy rejestr typów rozszerzalnych.     |
| routes/geometry_command_registry.py                       | Serwerowy rejestr komend.                   |
| routes/dependencies.py                                    | Graf zależności obiektów.                   |
| routes/object_tree.py                                     | Nawigacja po grupach i obiektach złożonych. |
| routes/image_recognition_import.py                        | Import obrazu do dokumentu.                 |
| routes/tests.py                                           | Kompletny zestaw testów.                    |
| routes/templates/routes/drawing_detail.html               | Główny ekran edytora.                       |
| routes/static/routes/drawing_editor_krok90_labels_text.js | Aktywna implementacja edytora.              |
| routes/static/routes/tool_registry_krok90.js              | Aktywny rejestr narzędzi.                   |
| routes/static/routes/geometry_command_registry.js         | Klienckie obliczenia geometryczne.          |
| routes/static/routes/ratio_point_plugin.js                | Przykładowy plugin.                         |
| experiments/image_recognition/                            | Środowisko eksperymentów CV/OCR.            |

# 19. Słownik pojęć

| **Pojęcie**   | **Znaczenie w projekcie**                             |
|---------------|-------------------------------------------------------|
| Drawing       | Cały dokument rysunkowy użytkownika.                  |
| DrawingObject | Pojedynczy strukturalny obiekt dokumentu.             |
| object_id     | Stabilny identyfikator obiektu w obrębie rysunku.     |
| type          | Namespacowany typ obiektu.                            |
| data          | Dane geometryczne, tekstowe i referencje.             |
| style         | Parametry wyglądu.                                    |
| dependency    | Odwołanie obiektu zależnego do obiektu bazowego.      |
| resolver      | Funkcja obliczająca pozycję obiektu zależnego.        |
| registry      | Rejestr definicji typów, narzędzi lub komend.         |
| bulk create   | Atomowe utworzenie pakietu powiązanych obiektów.      |
| legacy        | Starsza część projektu zachowana dla kompatybilności. |

# 20. Podsumowanie

Route Editor jest znacznie bardziej rozbudowany niż prosty edytor SVG. Jego rdzeniem jest strukturalny model rysunku oraz mechanizm zależności geometrycznych. Projekt posiada wyraźne elementy architektury pluginowej, walidację klient–serwer, eksport publikacyjny, historię operacji i eksperymentalny moduł rekonstrukcji z obrazu. Najważniejsze zadania przed dalszym rozwojem to uporządkowanie repozytorium, modularizacja JavaScriptu, uruchamianie testów w CI oraz rozwój rozpoznawania odręcznych szkiców.
