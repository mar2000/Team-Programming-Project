# Dokumentacja Route Editor

Niniejsza dokumentacja opisuje aktualny stan aplikacji, jej przeznaczenie, architekturę, model danych, sposób działania edytora, kontrakty API, mechanizm zależności, eksport, import, rozszerzalność, testowanie i ograniczenia wdrożeniowe.

Dokumentacja jest zorientowana na produkt i kod źródłowy. Nie przedstawia historii powstawania projektu ani sekwencji zmian.

## Spis dokumentów

1. [Opis systemu i zakres funkcjonalny](01-opis-systemu.md)
2. [Architektura i przepływ danych](02-architektura.md)
3. [Model danych i format obiektów](03-model-danych.md)
4. [Frontend i interaktywny edytor](04-frontend-edytor.md)
5. [Backend, widoki i API](05-backend-api.md)
6. [Geometria dynamiczna i zależności](06-geometria-zaleznosci.md)
7. [Grafy, wykresy, import i eksport](07-grafy-wykresy-eksport.md)
8. [Rozszerzalność i system dodatków](08-rozszerzalnosc.md)
9. [Rozpoznawanie rysunków z obrazu](09-rozpoznawanie-obrazow.md)
10. [Instalacja, konfiguracja i uruchamianie](10-instalacja.md)
11. [Testy, jakość i diagnostyka](11-testy-i-jakosc.md)
12. [Bezpieczeństwo, ograniczenia i dalszy rozwój](12-bezpieczenstwo-i-rozwoj.md)
13. [Mapa plików źródłowych](13-mapa-plikow.md)

## Odbiorcy dokumentacji

Dokumentacja jest przeznaczona dla:

- osoby rozwijającej aplikację;
- recenzenta technicznego;
- opiekuna projektu;
- osoby wdrażającej projekt lokalnie;
- autora dodatku rozszerzającego edytor;
- użytkownika technicznego chcącego zrozumieć format danych.
