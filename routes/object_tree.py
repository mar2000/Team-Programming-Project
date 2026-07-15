"""Ogólne przechodzenie po strukturze obiektów rysunku.

Krok 45 przygotowuje core na przejście z płaskiej listy do Composite. Obecny
backend nadal zapisuje DrawingObject jako płaskie rekordy, ale funkcje z tego
modułu potrafią już przechodzić po obiektach posiadających ``children`` lub
``data['children']``.
"""


def child_objects(obj):
    """Zwraca bezpośrednie dzieci obiektu w przyszłej strukturze Composite."""
    if isinstance(obj, dict):
        children = obj.get('children')
        if isinstance(children, list):
            return children
        data = obj.get('data')
        if isinstance(data, dict) and isinstance(data.get('children'), list):
            return data['children']
        return []

    children = getattr(obj, 'children', None)
    if isinstance(children, list):
        return children
    data = getattr(obj, 'data', None)
    if isinstance(data, dict) and isinstance(data.get('children'), list):
        return data['children']
    return []


def walk_objects(objects):
    """Iteruje depth-first po obiektach, zwracając ``(obj, parent, depth)``.

    Ochrona po tożsamości obiektu zapobiega nieskończonej rekurencji, jeśli
    przyszła struktura grup zostanie przypadkowo zapętlona.
    """
    active_path = set()

    def walk(items, parent=None, depth=0):
        for obj in items or []:
            marker = id(obj)
            if marker in active_path:
                continue
            active_path.add(marker)
            yield obj, parent, depth
            yield from walk(child_objects(obj), obj, depth + 1)
            active_path.remove(marker)

    yield from walk(objects)


def flatten_objects(objects):
    """Zwraca płaską listę wszystkich kontenerów i liści."""
    return [obj for obj, _parent, _depth in walk_objects(objects)]


def object_id(obj):
    if isinstance(obj, dict):
        return obj.get('object_id')
    return getattr(obj, 'object_id', None)


def find_object_by_id(objects, target_id):
    """Znajduje obiekt niezależnie od poziomu zagnieżdżenia."""
    return next((obj for obj in flatten_objects(objects) if object_id(obj) == target_id), None)
