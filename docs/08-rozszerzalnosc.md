# 8. Rozszerzalność i system dodatków

## 8.1. Cel architektury rozszerzeń

Dodanie nowej konstrukcji nie powinno wymagać przebudowy modeli bazy danych. Projekt używa typów namespacowanych i rejestrów, aby nowy obiekt mógł dostarczyć własną walidację, sposób wyznaczania pozycji i eksport.

## 8.2. Definicja typu po stronie backendu

`ObjectTypeDefinition` przechowuje właściwości typu. Rejestr udostępnia funkcje:

- `register_object_type`;
- `get_object_type`;
- `registered_object_types`;
- `validate_registered_object_type`;
- `resolve_registered_position`;
- `render_registered_tikz`.

Typ powinien mieć unikalną nazwę namespacowaną, na przykład `plugin_name.object_name`.

## 8.3. Definicja komendy geometrycznej

`GeometryCommandDefinition` opisuje interakcję prowadzącą do utworzenia obiektu. Zawiera identyfikator komendy, typ wynikowy, specyfikację argumentów i walidator parametrów.

Komenda odpowiada na pytanie „jak użytkownik tworzy obiekt”, natomiast typ obiektu odpowiada na pytanie „jak obiekt jest zapisany i obliczany”.

## 8.4. Rejestr narzędzi w przeglądarce

Narzędzie posiada:

- `id`;
- `label`;
- grupę i etykietę grupy;
- listę trybów;
- kolejność;
- opcjonalny `commandId`;
- funkcje działania lub budowania payloadu.

Rejestr udostępnia API dodatku do rejestrowania i wyrejestrowywania narzędzi.

## 8.5. Plugin przykładowy

W projekcie znajdują się:

- `example_plugin.js` — minimalny przykład integracji;
- `ratio_point_plugin.js` — kompletny dodatek punktu dzielącego odcinek.

Dodatek może dostarczać:

- nowe narzędzie;
- własny renderer;
- pola właściwości;
- akcje na zaznaczonym obiekcie;
- logikę tworzenia;
- walidację lokalną;
- mapowanie danych do backendowego typu.

## 8.6. Kontrakt bezpieczeństwa dodatku

Frontend dodatku nie zastępuje backendowej walidacji. Każdy trwały typ powinien być również zarejestrowany po stronie Django. W przeciwnym razie dowolny klient mógłby wysłać niezweryfikowany payload.

## 8.7. Procedura dodania nowego typu

1. Wybrać namespacowany identyfikator.
2. Zdefiniować strukturę `data` i `style`.
3. Dodać backendowy walidator.
4. Dodać resolver pozycji, jeśli obiekt jest zależny.
5. Dodać renderer TikZ, jeśli ma być eksportowalny.
6. Zarejestrować komendę tworzenia.
7. Zarejestrować narzędzie frontendowe.
8. Dodać renderer SVG.
9. Dodać pola edycji, jeśli są potrzebne.
10. Dodać testy walidacji, API, zależności i eksportu.
