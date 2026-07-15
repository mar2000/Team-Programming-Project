"""Rejestr deklaratywnych komend geometrycznych (Krok 65).

Komenda opisuje wejścia, parametry i typ wyniku. Rejestr nie wykonuje kodu
przesłanego przez klienta; wszystkie definicje backendowe są zaufanymi
modułami Pythona instalowanymi razem z aplikacją.
"""
from dataclasses import dataclass
from typing import Callable, Iterable


@dataclass(frozen=True)
class GeometryCommandDefinition:
    command_id: str
    display_name: str
    result_type: str
    input_fields: tuple[str, ...]
    input_type: str = "geometry.point"
    parameter_fields: tuple[str, ...] = ()
    validator: Callable | None = None
    help_text: str = ""


_REGISTRY: dict[str, GeometryCommandDefinition] = {}


def register_geometry_command(definition: GeometryCommandDefinition):
    if not isinstance(definition, GeometryCommandDefinition):
        raise TypeError("definition must be GeometryCommandDefinition")
    if not definition.command_id:
        raise ValueError("command_id is required")
    if not definition.result_type:
        raise ValueError("result_type is required")
    if definition.command_id in _REGISTRY:
        raise ValueError(f"Geometry command {definition.command_id} is already registered")
    _REGISTRY[definition.command_id] = definition
    return definition


def get_geometry_command(command_id):
    return _REGISTRY.get(command_id)


def registered_geometry_commands() -> Iterable[GeometryCommandDefinition]:
    return tuple(_REGISTRY.values())


def validate_geometry_command(*, command_id, object_type, data, object_type_for):
    definition = get_geometry_command(command_id)
    if not definition:
        return {"command": f"Unknown geometry command: {command_id}."}
    errors = {}
    if object_type != definition.result_type:
        errors["type"] = f"Command {command_id} creates {definition.result_type}, not {object_type}."
    declared = data.get("command")
    if declared not in (None, "", command_id):
        errors["command"] = f"command must be {command_id}."
    for field in definition.input_fields:
        actual_type = object_type_for(data.get(field))
        if actual_type != definition.input_type:
            errors[field] = f"{field} must reference an existing {definition.input_type} object."
    values = [data.get(field) for field in definition.input_fields]
    if len(values) != len(set(values)):
        errors[definition.input_fields[-1]] = f"Command {command_id} requires different input objects."
    if definition.validator:
        errors.update(definition.validator(data=data))
    return errors


def _validate_midpoint(data):
    errors = {}
    if "label" in data and not isinstance(data.get("label"), str):
        errors["label"] = "geometry.midpoint label must be a string."
    return errors



def _validate_line_intersection(data):
    errors = {}
    if "label" in data and not isinstance(data.get("label"), str):
        errors["label"] = "geometry.line_intersection label must be a string."
    return errors


def _validate_perpendicular_projection(data):
    errors = {}
    if "label" in data and not isinstance(data.get("label"), str):
        errors["label"] = "geometry.perpendicular_projection label must be a string."
    return errors


def _validate_segment_projection(data):
    errors = {}
    if "label" in data and not isinstance(data.get("label"), str):
        errors["label"] = "geometry.segment_projection label must be a string."
    return errors


def _validate_circle_nearest_point(data):
    errors = {}
    if "label" in data and not isinstance(data.get("label"), str):
        errors["label"] = "geometry.circle_nearest_point label must be a string."
    return errors


def _validate_line_circle_intersection(data):
    errors = {}
    try:
        branch = int(data.get("branch"))
        if branch not in (-1, 0, 1):
            errors["branch"] = "branch must be -1, 0 or 1."
    except (TypeError, ValueError):
        errors["branch"] = "branch must be -1, 0 or 1."
    if "label" in data and not isinstance(data.get("label"), str):
        errors["label"] = "geometry.line_circle_intersection label must be a string."
    return errors


def _validate_circle_circle_intersection(data):
    errors = {}
    try:
        branch = int(data.get("branch"))
        if branch not in (-1, 0, 1):
            errors["branch"] = "branch must be -1, 0 or 1."
    except (TypeError, ValueError):
        errors["branch"] = "branch must be -1, 0 or 1."
    if "label" in data and not isinstance(data.get("label"), str):
        errors["label"] = "geometry.circle_circle_intersection label must be a string."
    return errors




def _validate_circumcenter(data):
    errors = {}
    if "label" in data and not isinstance(data.get("label"), str):
        errors["label"] = "geometry.circumcenter label must be a string."
    return errors


def _validate_orthocenter(data):
    errors = {}
    if "label" in data and not isinstance(data.get("label"), str):
        errors["label"] = "geometry.orthocenter label must be a string."
    return errors


def _validate_centroid(data):
    errors = {}
    if "label" in data and not isinstance(data.get("label"), str):
        errors["label"] = "geometry.centroid label must be a string."
    return errors


def _validate_nine_point_center(data):
    errors = {}
    if "label" in data and not isinstance(data.get("label"), str):
        errors["label"] = "geometry.nine_point_center label must be a string."
    return errors


def _validate_incenter(data):
    errors = {}
    if "label" in data and not isinstance(data.get("label"), str):
        errors["label"] = "geometry.incenter label must be a string."
    return errors


def _validate_excenter(data):
    errors = {}
    if "label" in data and not isinstance(data.get("label"), str):
        errors["label"] = "geometry.excenter label must be a string."
    if data.get("oppositeVertex") not in {"A", "B", "C"}:
        errors["oppositeVertex"] = "oppositeVertex must be one of A, B or C."
    return errors


def _validate_excircle_touchpoint(data):
    errors = {}
    if "label" in data and not isinstance(data.get("label"), str):
        errors["label"] = "geometry.excircle_touchpoint label must be a string."
    if data.get("oppositeVertex") not in {"A", "B", "C"}:
        errors["oppositeVertex"] = "oppositeVertex must be one of A, B or C."
    if data.get("side") not in {"AB", "BC", "CA"}:
        errors["side"] = "side must be one of AB, BC or CA."
    return errors


def _validate_incircle_touchpoint(data):
    errors = {}
    if "label" in data and not isinstance(data.get("label"), str):
        errors["label"] = "geometry.incircle_touchpoint label must be a string."
    if data.get("side") not in {"AB", "BC", "CA"}:
        errors["side"] = "side must be one of AB, BC or CA."
    return errors


def _validate_reflection_across_line(data):
    errors = {}
    if "label" in data and not isinstance(data.get("label"), str):
        errors["label"] = "geometry.reflection_across_line label must be a string."
    return errors


def _validate_rotation_around_point(data):
    errors = {}
    try:
        angle = float(data.get("angleDegrees"))
        if not (-360000 <= angle <= 360000):
            errors["angleDegrees"] = "angleDegrees is outside the supported range."
    except (TypeError, ValueError):
        errors["angleDegrees"] = "angleDegrees must be a number."
    if "label" in data and not isinstance(data.get("label"), str):
        errors["label"] = "geometry.rotation_around_point label must be a string."
    return errors


def _validate_central_reflection(data):
    errors = {}
    if "label" in data and not isinstance(data.get("label"), str):
        errors["label"] = "geometry.central_reflection label must be a string."
    return errors


def _validate_homothety(data):
    errors = {}
    try:
        scale = float(data.get("scaleFactor"))
        if not (-1000000 <= scale <= 1000000):
            errors["scaleFactor"] = "scaleFactor is outside the supported range."
    except (TypeError, ValueError):
        errors["scaleFactor"] = "scaleFactor must be a number."
    if "label" in data and not isinstance(data.get("label"), str):
        errors["label"] = "geometry.homothety label must be a string."
    return errors


def _validate_translation_by_vector(data):
    errors = {}
    if "label" in data and not isinstance(data.get("label"), str):
        errors["label"] = "geometry.translation_by_vector label must be a string."
    return errors


def _validate_ratio_point(data):
    errors = {}
    try:
        ratio = float(data.get("ratio"))
        if not 0 <= ratio <= 1:
            errors["ratio"] = "ratio must be between 0 and 1."
    except (TypeError, ValueError):
        errors["ratio"] = "ratio must be a number between 0 and 1."
    if "label" in data and not isinstance(data.get("label"), str):
        errors["label"] = "geometry.ratio_point label must be a string."
    return errors


register_geometry_command(GeometryCommandDefinition(
    command_id="midpoint",
    display_name="Środek odcinka",
    result_type="geometry.midpoint",
    input_fields=("source", "target"),
    validator=_validate_midpoint,
    help_text="Wskaż dwa różne punkty geometryczne. Wynik aktualizuje się automatycznie.",
))

register_geometry_command(GeometryCommandDefinition(
    command_id="ratio_point",
    display_name="Punkt w proporcji",
    result_type="geometry.ratio_point",
    input_fields=("source", "target"),
    parameter_fields=("ratio",),
    validator=_validate_ratio_point,
    help_text="Wybierz dwa punkty i parametr t; P=(1-t)A+tB.",
))


register_geometry_command(GeometryCommandDefinition(
    command_id="line_intersection",
    display_name="Punkt przecięcia prostych",
    result_type="geometry.line_intersection",
    input_fields=("a1", "a2", "b1", "b2"),
    validator=_validate_line_intersection,
    help_text="Wskaż kolejno dwa punkty pierwszej prostej i dwa punkty drugiej prostej.",
))


register_geometry_command(GeometryCommandDefinition(
    command_id="perpendicular_projection",
    display_name="Rzut prostokątny punktu na prostą",
    result_type="geometry.perpendicular_projection",
    input_fields=("point", "lineA", "lineB"),
    validator=_validate_perpendicular_projection,
    help_text="Wskaż punkt rzutowany, a następnie dwa różne punkty wyznaczające prostą.",
))




register_geometry_command(GeometryCommandDefinition(
    command_id="segment_projection",
    display_name="Najbliższy punkt na odcinku",
    result_type="geometry.segment_projection",
    input_fields=("point", "segmentA", "segmentB"),
    validator=_validate_segment_projection,
    help_text="Wskaż punkt, a następnie dwa różne końce odcinka. Wynik jest rzutem ograniczonym do odcinka.",
))

register_geometry_command(GeometryCommandDefinition(
    command_id="circle_nearest_point",
    display_name="Najbliższy punkt na okręgu",
    result_type="geometry.circle_nearest_point",
    input_fields=("point", "center", "radiusPoint"),
    validator=_validate_circle_nearest_point,
    help_text="Wskaż punkt, środek okręgu i punkt wyznaczający jego promień.",
))

register_geometry_command(GeometryCommandDefinition(
    command_id="line_circle_intersection",
    display_name="Punkt przecięcia prostej i okręgu",
    result_type="geometry.line_circle_intersection",
    input_fields=("lineA", "lineB", "center", "radiusPoint"),
    parameter_fields=("branch",),
    validator=_validate_line_circle_intersection,
    help_text="Wskaż dwa punkty prostej, środek okręgu i punkt wyznaczający jego promień.",
))

register_geometry_command(GeometryCommandDefinition(
    command_id="circle_circle_intersection",
    display_name="Punkt przecięcia dwóch okręgów",
    result_type="geometry.circle_circle_intersection",
    input_fields=("centerA", "radiusPointA", "centerB", "radiusPointB"),
    parameter_fields=("branch",),
    validator=_validate_circle_circle_intersection,
    help_text="Wskaż środek i punkt promienia pierwszego okręgu, a następnie środek i punkt promienia drugiego.",
))


register_geometry_command(GeometryCommandDefinition(
    command_id="circumcenter",
    display_name="Środek okręgu opisanego",
    result_type="geometry.circumcenter",
    input_fields=("pointA", "pointB", "pointC"),
    validator=_validate_circumcenter,
    help_text="Wskaż trzy różne, niewspółliniowe punkty. Wynik jest środkiem okręgu przechodzącego przez wszystkie trzy punkty.",
))

register_geometry_command(GeometryCommandDefinition(
    command_id="orthocenter",
    display_name="Ortocentrum trójkąta",
    result_type="geometry.orthocenter",
    input_fields=("pointA", "pointB", "pointC"),
    validator=_validate_orthocenter,
    help_text="Wskaż trzy różne, niewspółliniowe punkty. Wynik jest punktem przecięcia wysokości trójkąta.",
))

register_geometry_command(GeometryCommandDefinition(
    command_id="centroid",
    display_name="Środek ciężkości trójkąta",
    result_type="geometry.centroid",
    input_fields=("pointA", "pointB", "pointC"),
    validator=_validate_centroid,
    help_text="Wskaż trzy różne punkty. Wynik jest środkiem ciężkości trójkąta, czyli punktem przecięcia środkowych.",
))

register_geometry_command(GeometryCommandDefinition(
    command_id="nine_point_center",
    display_name="Środek okręgu dziewięciu punktów",
    result_type="geometry.nine_point_center",
    input_fields=("pointA", "pointB", "pointC"),
    validator=_validate_nine_point_center,
    help_text="Wskaż trzy różne, niewspółliniowe punkty. Wynik jest środkiem okręgu dziewięciu punktów trójkąta.",
))

register_geometry_command(GeometryCommandDefinition(
    command_id="incenter",
    display_name="Środek okręgu wpisanego w trójkąt",
    result_type="geometry.incenter",
    input_fields=("pointA", "pointB", "pointC"),
    validator=_validate_incenter,
    help_text="Wskaż trzy różne, niewspółliniowe punkty. Wynik jest środkiem okręgu wpisanego w trójkąt.",
))

register_geometry_command(GeometryCommandDefinition(
    command_id="excenter",
    display_name="Środek okręgu dopisanego do trójkąta",
    result_type="geometry.excenter",
    input_fields=("pointA", "pointB", "pointC"),
    parameter_fields=("oppositeVertex",),
    validator=_validate_excenter,
    help_text="Wskaż trzy różne, niewspółliniowe punkty i wybierz wierzchołek A, B lub C, naprzeciw którego leży środek okręgu dopisanego.",
))

register_geometry_command(GeometryCommandDefinition(
    command_id="excircle_touchpoint",
    display_name="Punkt styczności okręgu dopisanego",
    result_type="geometry.excircle_touchpoint",
    input_fields=("pointA", "pointB", "pointC"),
    parameter_fields=("oppositeVertex", "side"),
    validator=_validate_excircle_touchpoint,
    help_text="Wskaż trzy różne, niewspółliniowe punkty, wybierz środek okręgu dopisanego I_A/I_B/I_C oraz bok AB/BC/CA.",
))

register_geometry_command(GeometryCommandDefinition(
    command_id="incircle_touchpoint",
    display_name="Punkt styczności okręgu wpisanego",
    result_type="geometry.incircle_touchpoint",
    input_fields=("pointA", "pointB", "pointC"),
    parameter_fields=("side",),
    validator=_validate_incircle_touchpoint,
    help_text="Wskaż trzy różne, niewspółliniowe punkty i wybierz bok AB, BC lub CA.",
))

register_geometry_command(GeometryCommandDefinition(
    command_id="reflection_across_line",
    display_name="Odbicie punktu względem prostej",
    result_type="geometry.reflection_across_line",
    input_fields=("point", "lineA", "lineB"),
    validator=_validate_reflection_across_line,
    help_text="Wskaż punkt odbijany, a następnie dwa różne punkty wyznaczające prostą odbicia.",
))


register_geometry_command(GeometryCommandDefinition(
    command_id="central_reflection",
    display_name="Symetria środkowa punktu",
    result_type="geometry.central_reflection",
    input_fields=("point", "center"),
    validator=_validate_central_reflection,
    help_text="Wskaż punkt odbijany i środek symetrii.",
))


register_geometry_command(GeometryCommandDefinition(
    command_id="homothety",
    display_name="Jednokładność punktu względem środka",
    result_type="geometry.homothety",
    input_fields=("point", "center"),
    parameter_fields=("scaleFactor",),
    validator=_validate_homothety,
    help_text="Wskaż punkt i środek jednokładności, a następnie podaj współczynnik k.",
))


register_geometry_command(GeometryCommandDefinition(
    command_id="translation_by_vector",
    display_name="Translacja punktu o wektor",
    result_type="geometry.translation_by_vector",
    input_fields=("point", "vectorStart", "vectorEnd"),
    validator=_validate_translation_by_vector,
    help_text="Wskaż punkt przesuwany, a następnie początek i koniec wektora translacji.",
))


register_geometry_command(GeometryCommandDefinition(
    command_id="rotation_around_point",
    display_name="Obrót punktu wokół środka",
    result_type="geometry.rotation_around_point",
    input_fields=("point", "center"),
    parameter_fields=("angleDegrees",),
    validator=_validate_rotation_around_point,
    help_text="Wskaż punkt obracany i środek obrotu, a następnie podaj kąt w stopniach.",
))
