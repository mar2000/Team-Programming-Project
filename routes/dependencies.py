"""Wspólny mechanizm zależności pomiędzy obiektami rysunku.

Krok 42: moduł izoluje wiedzę o tym, które pola danych są referencjami
oraz pozwala core'owi znajdować obiekty zależne bez wpisywania szczególnych
przypadków w widokach API.
"""

from .object_type_registry import get_object_type

DEPENDENCY_FIELDS = {
    'graph.edge': ('source', 'target'),
    'geometry.segment': ('source', 'target'),
    'geometry.midpoint': ('source', 'target'),
    'geometry.circle': ('center', 'point'),
    'geometry.polygon': ('points',),
    'label.relative': ('baseObjectId',),
}


def dependency_ids_for_payload(object_type, data):
    """Zwraca uporządkowaną listę object_id używanych przez obiekt."""
    if not isinstance(data, dict):
        return []
    result = []
    definition = get_object_type(object_type)
    fields = definition.dependency_fields if definition else DEPENDENCY_FIELDS.get(object_type, ())
    for field in fields:
        value = data.get(field)
        values = value if isinstance(value, list) else [value]
        for object_id in values:
            if isinstance(object_id, str) and object_id.strip() and object_id not in result:
                result.append(object_id)
    return result


def dependency_ids_for_object(obj):
    return dependency_ids_for_payload(obj.type, obj.data)


def dependent_objects(objects, target_object_id):
    """Zwraca obiekty bezpośrednio zależne od wskazanego obiektu."""
    return [obj for obj in objects if target_object_id in dependency_ids_for_object(obj)]


def dependency_closure(objects, root_object_ids):
    """Wyznacza domknięcie zależności (rooty + wszyscy zależni potomkowie)."""
    by_id = {obj.object_id: obj for obj in objects}
    selected = set(root_object_ids)
    changed = True
    while changed:
        changed = False
        for obj in objects:
            if obj.object_id in selected:
                continue
            if any(dep in selected for dep in dependency_ids_for_object(obj)):
                selected.add(obj.object_id)
                changed = True
    return [by_id[object_id] for object_id in selected if object_id in by_id]


def remap_dependency_ids(object_type, data, id_map):
    """Zwraca kopię data z referencjami przepisanymi zgodnie z old_id -> new_id.

    Referencje do obiektów, których nie ma w ``id_map``, pozostają bez zmian.
    Dzięki temu można kopiować zarówno całe struktury, jak i pojedyncze obiekty
    zależne od elementów pozostających w oryginalnym rysunku.
    """
    if not isinstance(data, dict):
        return {}
    result = dict(data)
    definition = get_object_type(object_type)
    fields = definition.dependency_fields if definition else DEPENDENCY_FIELDS.get(object_type, ())
    for field in fields:
        value = result.get(field)
        if isinstance(value, list):
            result[field] = [id_map.get(item, item) for item in value]
        elif isinstance(value, str):
            result[field] = id_map.get(value, value)
    return result


def dependency_order(objects):
    """Porządkuje obiekty tak, aby zależności były przed obiektami zależnymi.

    Przy cyklu lub brakującej zależności zachowuje stabilnie pozostałą kolejność.
    """
    objects = list(objects)
    selected_ids = {obj.object_id for obj in objects}
    pending = list(objects)
    ordered = []
    emitted = set()
    while pending:
        ready = [
            obj for obj in pending
            if all(dep not in selected_ids or dep in emitted for dep in dependency_ids_for_object(obj))
        ]
        if not ready:
            ordered.extend(pending)
            break
        for obj in ready:
            ordered.append(obj)
            emitted.add(obj.object_id)
            pending.remove(obj)
    return ordered
