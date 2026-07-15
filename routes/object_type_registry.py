"""Rejestr typów obiektów rozszerzalny przez moduły/pluginy.

Krok 51 przenosi wiedzę o typach rozszerzeń poza główny widok API.
Plugin backendowy może zarejestrować zależności, dozwolone tryby,
walidator i resolver pozycji używany przez eksport.
"""
from dataclasses import dataclass
from typing import Callable, Iterable

from .geometry_command_registry import validate_geometry_command


@dataclass(frozen=True)
class ObjectTypeDefinition:
    type_id: str
    modes: frozenset[str]
    dependency_fields: tuple[str, ...] = ()
    validator: Callable | None = None
    position_resolver: Callable | None = None
    tikz_renderer: Callable | None = None
    point_like: bool = False
    display_name: str = ""


_REGISTRY: dict[str, ObjectTypeDefinition] = {}


def register_object_type(definition: ObjectTypeDefinition):
    if not isinstance(definition, ObjectTypeDefinition):
        raise TypeError("definition must be ObjectTypeDefinition")
    if not definition.type_id:
        raise ValueError("type_id is required")
    if definition.type_id in _REGISTRY:
        raise ValueError(f"Object type {definition.type_id} is already registered")
    _REGISTRY[definition.type_id] = definition
    return definition


def get_object_type(type_id):
    return _REGISTRY.get(type_id)


def registered_object_types() -> Iterable[ObjectTypeDefinition]:
    return tuple(_REGISTRY.values())


def validate_registered_object_type(*, drawing, object_type, data, object_type_for):
    definition = get_object_type(object_type)
    if not definition or not definition.validator:
        return {}
    return definition.validator(drawing=drawing, data=data, object_type_for=object_type_for)


def resolve_registered_position(obj, *, objects_by_id, resolve_position):
    definition = get_object_type(obj.type)
    if not definition or not definition.position_resolver:
        return None
    return definition.position_resolver(obj=obj, objects_by_id=objects_by_id, resolve_position=resolve_position)




def render_registered_tikz(obj, *, position, context):
    definition = get_object_type(obj.type)
    if not definition or not definition.tikz_renderer:
        return None
    return definition.tikz_renderer(obj=obj, position=position, context=context)


def _validate_ratio_point(*, drawing, data, object_type_for):
    return validate_geometry_command(
        command_id="ratio_point",
        object_type="geometry.ratio_point",
        data=data,
        object_type_for=object_type_for,
    )


def _resolve_ratio_point(*, obj, objects_by_id, resolve_position):
    data = obj.data or {}
    source = objects_by_id.get(data.get("source"))
    target = objects_by_id.get(data.get("target"))
    source_position = resolve_position(source)
    target_position = resolve_position(target)
    ratio = float(data.get("ratio"))
    if not source_position or not target_position:
        return None
    return (
        source_position[0] + ratio * (target_position[0] - source_position[0]),
        source_position[1] + ratio * (target_position[1] - source_position[1]),
    )


def _render_ratio_point_tikz(*, obj, position, context):
    x, y = position
    style = obj.style or {}
    data = obj.data or {}
    name = context["safe_identifier"](obj.object_id)
    x_text = context["format_number"](x)
    y_text = context["format_number"](y)
    stroke = context["color"](style.get("stroke"), "orange!70!black")
    fill = context["color"](style.get("fill"), "orange")
    width = context["style_number"](style.get("strokeWidth"), 1.5)
    radius = float(style.get("radius", 7)) / 100
    r = context["format_number"](radius)
    lines = [
        f"  \\coordinate ({name}) at ({x_text}, {y_text});",
        f"  \\node[diamond, draw={stroke}, fill={fill}, line width={width}pt, inner sep={r}cm] at ({name}) {{}};",
    ]
    label = data.get("label") or ""
    if label and style.get("showLabel", True) is not False:
        lines.append(f"  \\node[above right] at ({name}) {{$ {label} $}};")
    return lines


register_object_type(ObjectTypeDefinition(
    type_id="geometry.ratio_point",
    modes=frozenset({"geometry", "mixed"}),
    dependency_fields=("source", "target"),
    validator=_validate_ratio_point,
    position_resolver=_resolve_ratio_point,
    tikz_renderer=_render_ratio_point_tikz,
    point_like=True,
    display_name="Punkt w proporcji",
))


def _validate_line_intersection(*, drawing, data, object_type_for):
    return validate_geometry_command(
        command_id="line_intersection",
        object_type="geometry.line_intersection",
        data=data,
        object_type_for=object_type_for,
    )


def _resolve_line_intersection(*, obj, objects_by_id, resolve_position):
    data = obj.data or {}
    points = [resolve_position(objects_by_id.get(data.get(field))) for field in ("a1", "a2", "b1", "b2")]
    if any(point is None for point in points):
        return None
    (x1, y1), (x2, y2), (x3, y3), (x4, y4) = points
    denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(denominator) < 1e-9:
        return None
    determinant1 = x1 * y2 - y1 * x2
    determinant2 = x3 * y4 - y3 * x4
    x = (determinant1 * (x3 - x4) - (x1 - x2) * determinant2) / denominator
    y = (determinant1 * (y3 - y4) - (y1 - y2) * determinant2) / denominator
    return (x, y)


register_object_type(ObjectTypeDefinition(
    type_id="geometry.line_intersection",
    modes=frozenset({"geometry", "mixed"}),
    dependency_fields=("a1", "a2", "b1", "b2"),
    validator=_validate_line_intersection,
    position_resolver=_resolve_line_intersection,
    point_like=True,
    display_name="Punkt przecięcia prostych",
))


def _validate_perpendicular_projection(*, drawing, data, object_type_for):
    return validate_geometry_command(
        command_id="perpendicular_projection",
        object_type="geometry.perpendicular_projection",
        data=data,
        object_type_for=object_type_for,
    )


def _resolve_perpendicular_projection(*, obj, objects_by_id, resolve_position):
    data = obj.data or {}
    point = resolve_position(objects_by_id.get(data.get("point")))
    line_a = resolve_position(objects_by_id.get(data.get("lineA")))
    line_b = resolve_position(objects_by_id.get(data.get("lineB")))
    if not point or not line_a or not line_b:
        return None
    px, py = point
    ax, ay = line_a
    bx, by = line_b
    dx, dy = bx - ax, by - ay
    denominator = dx * dx + dy * dy
    if denominator < 1e-12:
        return None
    t = ((px - ax) * dx + (py - ay) * dy) / denominator
    return (ax + t * dx, ay + t * dy)


register_object_type(ObjectTypeDefinition(
    type_id="geometry.perpendicular_projection",
    modes=frozenset({"geometry", "mixed"}),
    dependency_fields=("point", "lineA", "lineB"),
    validator=_validate_perpendicular_projection,
    position_resolver=_resolve_perpendicular_projection,
    point_like=True,
    display_name="Rzut prostokątny na prostą",
))


def _validate_segment_projection(*, drawing, data, object_type_for):
    return validate_geometry_command(
        command_id="segment_projection",
        object_type="geometry.segment_projection",
        data=data,
        object_type_for=object_type_for,
    )


def _resolve_segment_projection(*, obj, objects_by_id, resolve_position):
    data = obj.data or {}
    point = resolve_position(objects_by_id.get(data.get("point")))
    segment_a = resolve_position(objects_by_id.get(data.get("segmentA")))
    segment_b = resolve_position(objects_by_id.get(data.get("segmentB")))
    if not point or not segment_a or not segment_b:
        return None
    px, py = point
    ax, ay = segment_a
    bx, by = segment_b
    dx, dy = bx - ax, by - ay
    denominator = dx * dx + dy * dy
    if denominator < 1e-12:
        return None
    raw_t = ((px - ax) * dx + (py - ay) * dy) / denominator
    t = max(0.0, min(1.0, raw_t))
    return (ax + t * dx, ay + t * dy)


register_object_type(ObjectTypeDefinition(
    type_id="geometry.segment_projection",
    modes=frozenset({"geometry", "mixed"}),
    dependency_fields=("point", "segmentA", "segmentB"),
    validator=_validate_segment_projection,
    position_resolver=_resolve_segment_projection,
    point_like=True,
    display_name="Najbliższy punkt na odcinku",
))


def _validate_circle_nearest_point(*, drawing, data, object_type_for):
    return validate_geometry_command(
        command_id="circle_nearest_point",
        object_type="geometry.circle_nearest_point",
        data=data,
        object_type_for=object_type_for,
    )


def _resolve_circle_nearest_point(*, obj, objects_by_id, resolve_position):
    data = obj.data or {}
    point = resolve_position(objects_by_id.get(data.get("point")))
    center = resolve_position(objects_by_id.get(data.get("center")))
    radius_point = resolve_position(objects_by_id.get(data.get("radiusPoint")))
    if not point or not center or not radius_point:
        return None
    px, py = point
    cx, cy = center
    rx, ry = radius_point
    radius = ((rx - cx) ** 2 + (ry - cy) ** 2) ** 0.5
    distance = ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5
    if radius < 1e-12 or distance < 1e-12:
        return None
    return (cx + radius * (px - cx) / distance, cy + radius * (py - cy) / distance)


register_object_type(ObjectTypeDefinition(
    type_id="geometry.circle_nearest_point",
    modes=frozenset({"geometry", "mixed"}),
    dependency_fields=("point", "center", "radiusPoint"),
    validator=_validate_circle_nearest_point,
    position_resolver=_resolve_circle_nearest_point,
    point_like=True,
    display_name="Najbliższy punkt na okręgu",
))


def _validate_line_circle_intersection(*, drawing, data, object_type_for):
    return validate_geometry_command(
        command_id="line_circle_intersection",
        object_type="geometry.line_circle_intersection",
        data=data,
        object_type_for=object_type_for,
    )


def _resolve_line_circle_intersection(*, obj, objects_by_id, resolve_position):
    data = obj.data or {}
    line_a = resolve_position(objects_by_id.get(data.get("lineA")))
    line_b = resolve_position(objects_by_id.get(data.get("lineB")))
    center = resolve_position(objects_by_id.get(data.get("center")))
    radius_point = resolve_position(objects_by_id.get(data.get("radiusPoint")))
    if not line_a or not line_b or not center or not radius_point:
        return None
    ax, ay = line_a
    bx, by = line_b
    cx, cy = center
    rx, ry = radius_point
    dx, dy = bx - ax, by - ay
    a = dx * dx + dy * dy
    radius_sq = (rx - cx) ** 2 + (ry - cy) ** 2
    if a < 1e-12 or radius_sq < 1e-12:
        return None
    fx, fy = ax - cx, ay - cy
    b = 2 * (fx * dx + fy * dy)
    c = fx * fx + fy * fy - radius_sq
    discriminant = b * b - 4 * a * c
    if discriminant < -1e-9:
        return None
    sqrt_discriminant = max(0.0, discriminant) ** 0.5
    branch = int(data.get("branch", 1))
    if abs(discriminant) <= 1e-9 or branch == 0:
        t = -b / (2 * a)
    elif branch < 0:
        t = (-b - sqrt_discriminant) / (2 * a)
    else:
        t = (-b + sqrt_discriminant) / (2 * a)
    return (ax + t * dx, ay + t * dy)


register_object_type(ObjectTypeDefinition(
    type_id="geometry.line_circle_intersection",
    modes=frozenset({"geometry", "mixed"}),
    dependency_fields=("lineA", "lineB", "center", "radiusPoint"),
    validator=_validate_line_circle_intersection,
    position_resolver=_resolve_line_circle_intersection,
    point_like=True,
    display_name="Przecięcie prostej i okręgu",
))



def _validate_circle_circle_intersection(*, drawing, data, object_type_for):
    return validate_geometry_command(
        command_id="circle_circle_intersection",
        object_type="geometry.circle_circle_intersection",
        data=data,
        object_type_for=object_type_for,
    )


def _resolve_circle_circle_intersection(*, obj, objects_by_id, resolve_position):
    data = obj.data or {}
    ca = resolve_position(objects_by_id.get(data.get("centerA")))
    ra = resolve_position(objects_by_id.get(data.get("radiusPointA")))
    cb = resolve_position(objects_by_id.get(data.get("centerB")))
    rb = resolve_position(objects_by_id.get(data.get("radiusPointB")))
    if not ca or not ra or not cb or not rb:
        return None
    x0, y0 = ca; x1, y1 = cb
    r0 = ((ra[0]-x0)**2 + (ra[1]-y0)**2)**0.5
    r1 = ((rb[0]-x1)**2 + (rb[1]-y1)**2)**0.5
    dx, dy = x1-x0, y1-y0
    d = (dx*dx + dy*dy)**0.5
    eps = 1e-9
    if r0 < eps or r1 < eps or d < eps or d > r0+r1+eps or d < abs(r0-r1)-eps:
        return None
    a = (r0*r0 - r1*r1 + d*d)/(2*d)
    h2 = r0*r0 - a*a
    if h2 < -eps:
        return None
    h = max(0.0, h2)**0.5
    xm, ym = x0 + a*dx/d, y0 + a*dy/d
    branch = int(data.get("branch", 1))
    if h <= eps or branch == 0:
        return (xm, ym)
    sign = -1 if branch < 0 else 1
    return (xm + sign*(-dy)*h/d, ym + sign*dx*h/d)


register_object_type(ObjectTypeDefinition(
    type_id="geometry.circle_circle_intersection",
    modes=frozenset({"geometry", "mixed"}),
    dependency_fields=("centerA", "radiusPointA", "centerB", "radiusPointB"),
    validator=_validate_circle_circle_intersection,
    position_resolver=_resolve_circle_circle_intersection,
    point_like=True,
    display_name="Przecięcie dwóch okręgów",
))



def _validate_circumcenter(*, drawing, data, object_type_for):
    return validate_geometry_command(
        command_id="circumcenter",
        object_type="geometry.circumcenter",
        data=data,
        object_type_for=object_type_for,
    )


def _resolve_circumcenter(*, obj, objects_by_id, resolve_position):
    data = obj.data or {}
    a = resolve_position(objects_by_id.get(data.get("pointA")))
    b = resolve_position(objects_by_id.get(data.get("pointB")))
    c = resolve_position(objects_by_id.get(data.get("pointC")))
    if not a or not b or not c:
        return None
    ax, ay = a
    bx, by = b
    cx, cy = c
    denominator = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
    if abs(denominator) < 1e-12:
        return None
    a_sq = ax * ax + ay * ay
    b_sq = bx * bx + by * by
    c_sq = cx * cx + cy * cy
    ux = (a_sq * (by - cy) + b_sq * (cy - ay) + c_sq * (ay - by)) / denominator
    uy = (a_sq * (cx - bx) + b_sq * (ax - cx) + c_sq * (bx - ax)) / denominator
    return (ux, uy)


register_object_type(ObjectTypeDefinition(
    type_id="geometry.circumcenter",
    modes=frozenset({"geometry", "mixed"}),
    dependency_fields=("pointA", "pointB", "pointC"),
    validator=_validate_circumcenter,
    position_resolver=_resolve_circumcenter,
    point_like=True,
    display_name="Środek okręgu opisanego",
))


def _validate_orthocenter(*, drawing, data, object_type_for):
    return validate_geometry_command(
        command_id="orthocenter",
        object_type="geometry.orthocenter",
        data=data,
        object_type_for=object_type_for,
    )


def _resolve_orthocenter(*, obj, objects_by_id, resolve_position):
    data = obj.data or {}
    a = resolve_position(objects_by_id.get(data.get("pointA")))
    b = resolve_position(objects_by_id.get(data.get("pointB")))
    c = resolve_position(objects_by_id.get(data.get("pointC")))
    if not a or not b or not c:
        return None
    ax, ay = a
    bx, by = b
    cx, cy = c
    denominator = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
    if abs(denominator) < 1e-12:
        return None
    a_sq = ax * ax + ay * ay
    b_sq = bx * bx + by * by
    c_sq = cx * cx + cy * cy
    ox = (a_sq * (by - cy) + b_sq * (cy - ay) + c_sq * (ay - by)) / denominator
    oy = (a_sq * (cx - bx) + b_sq * (ax - cx) + c_sq * (bx - ax)) / denominator
    return (ax + bx + cx - 2 * ox, ay + by + cy - 2 * oy)


register_object_type(ObjectTypeDefinition(
    type_id="geometry.orthocenter",
    modes=frozenset({"geometry", "mixed"}),
    dependency_fields=("pointA", "pointB", "pointC"),
    validator=_validate_orthocenter,
    position_resolver=_resolve_orthocenter,
    point_like=True,
    display_name="Ortocentrum trójkąta",
))



def _validate_nine_point_center(*, drawing, data, object_type_for):
    return validate_geometry_command(
        command_id="nine_point_center",
        object_type="geometry.nine_point_center",
        data=data,
        object_type_for=object_type_for,
    )


def _resolve_nine_point_center(*, obj, objects_by_id, resolve_position):
    data = obj.data or {}
    a = resolve_position(objects_by_id.get(data.get("pointA")))
    b = resolve_position(objects_by_id.get(data.get("pointB")))
    c = resolve_position(objects_by_id.get(data.get("pointC")))
    if not a or not b or not c:
        return None
    ax, ay = a
    bx, by = b
    cx, cy = c
    denominator = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
    if abs(denominator) < 1e-12:
        return None
    a_sq = ax * ax + ay * ay
    b_sq = bx * bx + by * by
    c_sq = cx * cx + cy * cy
    ox = (a_sq * (by - cy) + b_sq * (cy - ay) + c_sq * (ay - by)) / denominator
    oy = (a_sq * (cx - bx) + b_sq * (ax - cx) + c_sq * (bx - ax)) / denominator
    hx = ax + bx + cx - 2 * ox
    hy = ay + by + cy - 2 * oy
    return ((ox + hx) / 2.0, (oy + hy) / 2.0)


register_object_type(ObjectTypeDefinition(
    type_id="geometry.nine_point_center",
    modes=frozenset({"geometry", "mixed"}),
    dependency_fields=("pointA", "pointB", "pointC"),
    validator=_validate_nine_point_center,
    position_resolver=_resolve_nine_point_center,
    point_like=True,
    display_name="Środek okręgu dziewięciu punktów",
))


def _validate_centroid(*, drawing, data, object_type_for):
    return validate_geometry_command(
        command_id="centroid",
        object_type="geometry.centroid",
        data=data,
        object_type_for=object_type_for,
    )


def _resolve_centroid(*, obj, objects_by_id, resolve_position):
    data = obj.data or {}
    a = resolve_position(objects_by_id.get(data.get("pointA")))
    b = resolve_position(objects_by_id.get(data.get("pointB")))
    c = resolve_position(objects_by_id.get(data.get("pointC")))
    if not a or not b or not c:
        return None
    return ((a[0] + b[0] + c[0]) / 3.0, (a[1] + b[1] + c[1]) / 3.0)


register_object_type(ObjectTypeDefinition(
    type_id="geometry.centroid",
    modes=frozenset({"geometry", "mixed"}),
    dependency_fields=("pointA", "pointB", "pointC"),
    validator=_validate_centroid,
    position_resolver=_resolve_centroid,
    point_like=True,
    display_name="Środek ciężkości trójkąta",
))

def _validate_incenter(*, drawing, data, object_type_for):
    errors = validate_geometry_command(
        command_id="incenter",
        object_type="geometry.incenter",
        data=data,
        object_type_for=object_type_for,
    )
    if errors:
        return errors
    # Trójkąt musi być niezdegenerowany. Dokładne współrzędne są sprawdzane
    # również w resolverze, aby konstrukcja mogła bezpiecznie znikać po zmianach.
    return errors


def _resolve_incenter(*, obj, objects_by_id, resolve_position):
    data = obj.data or {}
    a = resolve_position(objects_by_id.get(data.get("pointA")))
    b = resolve_position(objects_by_id.get(data.get("pointB")))
    c = resolve_position(objects_by_id.get(data.get("pointC")))
    if not a or not b or not c:
        return None
    ax, ay = a
    bx, by = b
    cx, cy = c
    side_a = ((bx - cx) ** 2 + (by - cy) ** 2) ** 0.5
    side_b = ((ax - cx) ** 2 + (ay - cy) ** 2) ** 0.5
    side_c = ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5
    perimeter = side_a + side_b + side_c
    area2 = abs((bx - ax) * (cy - ay) - (by - ay) * (cx - ax))
    if perimeter < 1e-12 or area2 < 1e-12:
        return None
    return (
        (side_a * ax + side_b * bx + side_c * cx) / perimeter,
        (side_a * ay + side_b * by + side_c * cy) / perimeter,
    )


register_object_type(ObjectTypeDefinition(
    type_id="geometry.incenter",
    modes=frozenset({"geometry", "mixed"}),
    dependency_fields=("pointA", "pointB", "pointC"),
    validator=_validate_incenter,
    position_resolver=_resolve_incenter,
    point_like=True,
    display_name="Środek okręgu wpisanego w trójkąt",
))


def _validate_excircle_touchpoint(*, drawing, data, object_type_for):
    return validate_geometry_command(
        command_id="excircle_touchpoint",
        object_type="geometry.excircle_touchpoint",
        data=data,
        object_type_for=object_type_for,
    )


def _resolve_excircle_touchpoint(*, obj, objects_by_id, resolve_position):
    data = obj.data or {}
    points = {
        "A": resolve_position(objects_by_id.get(data.get("pointA"))),
        "B": resolve_position(objects_by_id.get(data.get("pointB"))),
        "C": resolve_position(objects_by_id.get(data.get("pointC"))),
    }
    if not all(points.values()):
        return None
    ax, ay = points["A"]; bx, by = points["B"]; cx, cy = points["C"]
    area2 = abs((bx-ax)*(cy-ay) - (by-ay)*(cx-ax))
    if area2 < 1e-12:
        return None
    side_a = ((bx-cx)**2 + (by-cy)**2) ** 0.5
    side_b = ((ax-cx)**2 + (ay-cy)**2) ** 0.5
    side_c = ((ax-bx)**2 + (ay-by)**2) ** 0.5
    vertex = data.get("oppositeVertex")
    weights = {
        "A": (-side_a, side_b, side_c),
        "B": (side_a, -side_b, side_c),
        "C": (side_a, side_b, -side_c),
    }.get(vertex)
    if not weights:
        return None
    wa, wb, wc = weights
    denominator = wa + wb + wc
    if abs(denominator) < 1e-12:
        return None
    ex = (wa*ax + wb*bx + wc*cx) / denominator
    ey = (wa*ay + wb*by + wc*cy) / denominator
    pair = {
        "AB": (points["A"], points["B"]),
        "BC": (points["B"], points["C"]),
        "CA": (points["C"], points["A"]),
    }.get(data.get("side"))
    if not pair:
        return None
    (x1, y1), (x2, y2) = pair
    dx, dy = x2-x1, y2-y1
    denom = dx*dx + dy*dy
    if denom < 1e-12:
        return None
    t = ((ex-x1)*dx + (ey-y1)*dy) / denom
    return (x1+t*dx, y1+t*dy)


register_object_type(ObjectTypeDefinition(
    type_id="geometry.excircle_touchpoint",
    modes=frozenset({"geometry", "mixed"}),
    dependency_fields=("pointA", "pointB", "pointC"),
    validator=_validate_excircle_touchpoint,
    position_resolver=_resolve_excircle_touchpoint,
    point_like=True,
    display_name="Punkt styczności okręgu dopisanego",
))


def _validate_incircle_touchpoint(*, drawing, data, object_type_for):
    return validate_geometry_command(
        command_id="incircle_touchpoint",
        object_type="geometry.incircle_touchpoint",
        data=data,
        object_type_for=object_type_for,
    )


def _resolve_incircle_touchpoint(*, obj, objects_by_id, resolve_position):
    data = obj.data or {}
    points = {
        "A": resolve_position(objects_by_id.get(data.get("pointA"))),
        "B": resolve_position(objects_by_id.get(data.get("pointB"))),
        "C": resolve_position(objects_by_id.get(data.get("pointC"))),
    }
    if not all(points.values()):
        return None
    ax, ay = points["A"]; bx, by = points["B"]; cx, cy = points["C"]
    area2 = abs((bx-ax)*(cy-ay) - (by-ay)*(cx-ax))
    if area2 < 1e-12:
        return None
    side_a = ((bx-cx)**2 + (by-cy)**2) ** 0.5
    side_b = ((ax-cx)**2 + (ay-cy)**2) ** 0.5
    side_c = ((ax-bx)**2 + (ay-by)**2) ** 0.5
    perimeter = side_a + side_b + side_c
    if perimeter < 1e-12:
        return None
    ix = (side_a*ax + side_b*bx + side_c*cx) / perimeter
    iy = (side_a*ay + side_b*by + side_c*cy) / perimeter
    side = data.get("side")
    endpoints = {"AB": (points["A"], points["B"]), "BC": (points["B"], points["C"]), "CA": (points["C"], points["A"])}
    pair = endpoints.get(side)
    if not pair:
        return None
    (x1,y1),(x2,y2)=pair
    dx,dy=x2-x1,y2-y1
    denom=dx*dx+dy*dy
    if denom < 1e-12:
        return None
    t=((ix-x1)*dx+(iy-y1)*dy)/denom
    return (x1+t*dx, y1+t*dy)


def _validate_excenter(*, drawing, data, object_type_for):
    return validate_geometry_command(
        command_id="excenter",
        object_type="geometry.excenter",
        data=data,
        object_type_for=object_type_for,
    )


def _resolve_excenter(*, obj, objects_by_id, resolve_position):
    data = obj.data or {}
    a = resolve_position(objects_by_id.get(data.get("pointA")))
    b = resolve_position(objects_by_id.get(data.get("pointB")))
    c = resolve_position(objects_by_id.get(data.get("pointC")))
    if not a or not b or not c:
        return None
    ax, ay = a; bx, by = b; cx, cy = c
    area2 = abs((bx-ax)*(cy-ay) - (by-ay)*(cx-ax))
    if area2 < 1e-12:
        return None
    side_a = ((bx-cx)**2 + (by-cy)**2) ** 0.5
    side_b = ((ax-cx)**2 + (ay-cy)**2) ** 0.5
    side_c = ((ax-bx)**2 + (ay-by)**2) ** 0.5
    vertex = data.get("oppositeVertex")
    weights = {
        "A": (-side_a, side_b, side_c),
        "B": (side_a, -side_b, side_c),
        "C": (side_a, side_b, -side_c),
    }.get(vertex)
    if not weights:
        return None
    wa, wb, wc = weights
    denominator = wa + wb + wc
    if abs(denominator) < 1e-12:
        return None
    return (
        (wa*ax + wb*bx + wc*cx) / denominator,
        (wa*ay + wb*by + wc*cy) / denominator,
    )


register_object_type(ObjectTypeDefinition(
    type_id="geometry.excenter",
    modes=frozenset({"geometry", "mixed"}),
    dependency_fields=("pointA", "pointB", "pointC"),
    validator=_validate_excenter,
    position_resolver=_resolve_excenter,
    point_like=True,
    display_name="Środek okręgu dopisanego do trójkąta",
))


register_object_type(ObjectTypeDefinition(
    type_id="geometry.incircle_touchpoint",
    modes=frozenset({"geometry", "mixed"}),
    dependency_fields=("pointA", "pointB", "pointC"),
    validator=_validate_incircle_touchpoint,
    position_resolver=_resolve_incircle_touchpoint,
    point_like=True,
    display_name="Punkt styczności okręgu wpisanego",
))


def _validate_reflection_across_line(*, drawing, data, object_type_for):
    return validate_geometry_command(
        command_id="reflection_across_line",
        object_type="geometry.reflection_across_line",
        data=data,
        object_type_for=object_type_for,
    )


def _resolve_reflection_across_line(*, obj, objects_by_id, resolve_position):
    data = obj.data or {}
    point = resolve_position(objects_by_id.get(data.get("point")))
    line_a = resolve_position(objects_by_id.get(data.get("lineA")))
    line_b = resolve_position(objects_by_id.get(data.get("lineB")))
    if not point or not line_a or not line_b:
        return None
    px, py = point
    ax, ay = line_a
    bx, by = line_b
    dx, dy = bx - ax, by - ay
    denominator = dx * dx + dy * dy
    if denominator < 1e-12:
        return None
    t = ((px - ax) * dx + (py - ay) * dy) / denominator
    hx, hy = ax + t * dx, ay + t * dy
    return (2 * hx - px, 2 * hy - py)


register_object_type(ObjectTypeDefinition(
    type_id="geometry.reflection_across_line",
    modes=frozenset({"geometry", "mixed"}),
    dependency_fields=("point", "lineA", "lineB"),
    validator=_validate_reflection_across_line,
    position_resolver=_resolve_reflection_across_line,
    point_like=True,
    display_name="Odbicie punktu względem prostej",
))


def _validate_rotation_around_point(*, drawing, data, object_type_for):
    return validate_geometry_command(
        command_id="rotation_around_point",
        object_type="geometry.rotation_around_point",
        data=data,
        object_type_for=object_type_for,
    )


def _resolve_rotation_around_point(*, obj, objects_by_id, resolve_position):
    import math
    data = obj.data or {}
    point = resolve_position(objects_by_id.get(data.get("point")))
    center = resolve_position(objects_by_id.get(data.get("center")))
    if not point or not center:
        return None
    try:
        angle = math.radians(float(data.get("angleDegrees")))
    except (TypeError, ValueError):
        return None
    px, py = point
    cx, cy = center
    dx, dy = px - cx, py - cy
    cosine, sine = math.cos(angle), math.sin(angle)
    return (cx + cosine * dx - sine * dy, cy + sine * dx + cosine * dy)


register_object_type(ObjectTypeDefinition(
    type_id="geometry.rotation_around_point",
    modes=frozenset({"geometry", "mixed"}),
    dependency_fields=("point", "center"),
    validator=_validate_rotation_around_point,
    position_resolver=_resolve_rotation_around_point,
    point_like=True,
    display_name="Obrót punktu wokół środka",
))


def _validate_central_reflection(*, drawing, data, object_type_for):
    return validate_geometry_command(
        command_id="central_reflection",
        object_type="geometry.central_reflection",
        data=data,
        object_type_for=object_type_for,
    )


def _resolve_central_reflection(*, obj, objects_by_id, resolve_position):
    data = obj.data or {}
    point = resolve_position(objects_by_id.get(data.get("point")))
    center = resolve_position(objects_by_id.get(data.get("center")))
    if not point or not center:
        return None
    px, py = point
    cx, cy = center
    return (2 * cx - px, 2 * cy - py)


register_object_type(ObjectTypeDefinition(
    type_id="geometry.central_reflection",
    modes=frozenset({"geometry", "mixed"}),
    dependency_fields=("point", "center"),
    validator=_validate_central_reflection,
    position_resolver=_resolve_central_reflection,
    point_like=True,
    display_name="Symetria środkowa punktu",
))


def _validate_homothety(*, drawing, data, object_type_for):
    return validate_geometry_command(
        command_id="homothety",
        object_type="geometry.homothety",
        data=data,
        object_type_for=object_type_for,
    )


def _resolve_homothety(*, obj, objects_by_id, resolve_position):
    data = obj.data or {}
    point = resolve_position(objects_by_id.get(data.get("point")))
    center = resolve_position(objects_by_id.get(data.get("center")))
    if not point or not center:
        return None
    try:
        scale = float(data.get("scaleFactor"))
    except (TypeError, ValueError):
        return None
    px, py = point
    cx, cy = center
    return (cx + scale * (px - cx), cy + scale * (py - cy))


register_object_type(ObjectTypeDefinition(
    type_id="geometry.homothety",
    modes=frozenset({"geometry", "mixed"}),
    dependency_fields=("point", "center"),
    validator=_validate_homothety,
    position_resolver=_resolve_homothety,
    point_like=True,
    display_name="Jednokładność punktu względem środka",
))


def _validate_translation_by_vector(*, drawing, data, object_type_for):
    return validate_geometry_command(
        command_id="translation_by_vector",
        object_type="geometry.translation_by_vector",
        data=data,
        object_type_for=object_type_for,
    )


def _resolve_translation_by_vector(*, obj, objects_by_id, resolve_position):
    data = obj.data or {}
    point = resolve_position(objects_by_id.get(data.get("point")))
    vector_start = resolve_position(objects_by_id.get(data.get("vectorStart")))
    vector_end = resolve_position(objects_by_id.get(data.get("vectorEnd")))
    if not point or not vector_start or not vector_end:
        return None
    px, py = point
    ax, ay = vector_start
    bx, by = vector_end
    return (px + bx - ax, py + by - ay)


register_object_type(ObjectTypeDefinition(
    type_id="geometry.translation_by_vector",
    modes=frozenset({"geometry", "mixed"}),
    dependency_fields=("point", "vectorStart", "vectorEnd"),
    validator=_validate_translation_by_vector,
    position_resolver=_resolve_translation_by_vector,
    point_like=True,
    display_name="Translacja punktu o wektor",
))
