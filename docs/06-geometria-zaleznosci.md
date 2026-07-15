# 6. Geometria dynamiczna i zależności

## 6.1. Idea konstrukcji zależnych

Obiekt zależny nie przechowuje wyłącznie aktualnych współrzędnych. Przechowuje definicję konstrukcji: identyfikatory obiektów bazowych i parametry. Pozycja może być ponownie wyliczona w dowolnym momencie.

Przykład środka odcinka:

```json
{
  "type": "geometry.ratio_point",
  "data": {
    "startId": "A",
    "endId": "B",
    "ratio": 0.5
  }
}
```

## 6.2. Dwustronne obliczenia

Geometria jest implementowana zarówno po stronie JavaScript, jak i Python.

Frontend liczy pozycje natychmiast, aby interakcja była płynna. Backend ma niezależne resolvery do walidacji, eksportu i spójności. Rozdzielenie zmniejsza ryzyko, że klient zapisze dowolne, niespójne współrzędne.

## 6.3. Graf zależności

Każdy obiekt jest wierzchołkiem grafu zależności. Krawędź skierowana prowadzi od obiektu zależnego do jego argumentu. Mechanizmy systemowe wykorzystują ten graf do:

- ustalenia kolejności tworzenia;
- kopiowania;
- usuwania kaskadowego;
- remapowania identyfikatorów;
- wykrywania brakujących argumentów;
- aktualizowania konstrukcji po ruchu punktu.

## 6.4. Podstawowe konstrukcje

### Środek i punkt w stosunku

Pozycja jest interpolacją liniową między punktami końcowymi. Dla parametru `t`:

```text
P = (1 - t) A + t B
```

### Przecięcie prostych

System wyznacza przecięcie dwóch prostych zdefiniowanych przez pary punktów. Walidacja musi obsłużyć proste równoległe lub niemal równoległe.

### Rzut prostokątny

Punkt jest rzutowany na prostą poprzez iloczyn skalarny i parametr projekcji.

### Rzut na odcinek

Parametr rzutu jest ograniczany do przedziału `[0, 1]`, dzięki czemu wynik leży na odcinku, a nie na całej prostej.

### Najbliższy punkt okręgu

Wektor od środka do punktu referencyjnego jest normalizowany i skalowany promieniem.

## 6.5. Przecięcia z okręgami

### Prosta i okrąg

Rozwiązanie powstaje przez podstawienie parametrycznej prostej do równania okręgu. Liczba rozwiązań zależy od wyróżnika. Typ może przechowywać wybór jednej z dwóch gałęzi przecięcia.

### Dwa okręgi

Algorytm wyznacza linię centrów, odległość między środkami i wysokość punktu przecięcia względem tej linii. Obsługiwane muszą być przypadki:

- brak przecięcia;
- styczność;
- dwa przecięcia;
- okręgi współśrodkowe;
- jeden okrąg wewnątrz drugiego.

## 6.6. Szczególne punkty trójkąta

### Środek ciężkości

Średnia arytmetyczna współrzędnych trzech wierzchołków.

### Środek okręgu opisanego

Punkt równoodległy od wierzchołków, obliczany z przecięcia symetralnych lub wzoru współrzędnościowego.

### Ortocentrum

Punkt przecięcia wysokości trójkąta.

### Środek okręgu dziewięciu punktów

Środek odcinka łączącego środek okręgu opisanego z ortocentrum.

### Środek okręgu wpisanego

Średnia ważona wierzchołków długościami przeciwległych boków.

### Środki okręgów dopisanych

Analogiczne kombinacje barycentryczne z odpowiednim wyborem znaku i wskazaniem boku.

### Punkty styczności

Wyznaczane jako rzuty odpowiedniego środka okręgu na bok lub jego przedłużenie.

## 6.7. Przekształcenia

### Odbicie względem prostej

Najpierw wyznaczany jest rzut punktu na prostą, a następnie punkt po drugiej stronie w tej samej odległości.

### Obrót

Dla kąta `θ` stosowana jest macierz obrotu względem wskazanego środka.

### Symetria środkowa

Jest szczególnym przypadkiem obrotu o 180° lub przekształceniem `P' = 2C - P`.

### Jednokładność

Punkt wynikowy spełnia `P' = C + k(P - C)`.

### Translacja

Wektor przesunięcia jest definiowany przez dwa punkty, a następnie dodawany do punktu transformowanego.

## 6.8. Stabilność numeryczna

Obliczenia geometryczne używają liczb zmiennoprzecinkowych. Implementacja musi odróżniać dokładne zero od wartości bliskich zeru, zwłaszcza przy równoległości, współliniowości i degeneracji trójkąta. Walidatory odrzucają konstrukcje, dla których wynik nie jest jednoznaczny lub matematycznie określony.
