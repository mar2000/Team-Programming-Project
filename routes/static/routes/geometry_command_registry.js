(function (global) {
    "use strict";

    const commands = new Map();

    function normalize(definition) {
        if (!definition || typeof definition !== "object") { throw new TypeError("Definicja komendy musi być obiektem."); }
        const command = {...definition};
        if (!command.id || typeof command.id !== "string") { throw new Error("Komenda geometryczna wymaga id."); }
        if (!command.label || typeof command.label !== "string") { throw new Error("Komenda geometryczna wymaga label."); }
        if (!command.resultType || typeof command.resultType !== "string") { throw new Error("Komenda geometryczna wymaga resultType."); }
        command.inputFields = Array.isArray(command.inputFields) ? [...command.inputFields] : [];
        command.parameterFields = Array.isArray(command.parameterFields) ? [...command.parameterFields] : [];
        command.inputType = command.inputType || "geometry.point";
        return Object.freeze(command);
    }

    function register(definition) {
        const command = normalize(definition);
        if (commands.has(command.id)) { throw new Error("Komenda " + command.id + " jest już zarejestrowana."); }
        commands.set(command.id, command);
        return command;
    }

    function get(commandId) { return commands.get(commandId) || null; }
    function all() { return Array.from(commands.values()); }
    function forResultType(resultType) { return all().filter((command) => command.resultType === resultType); }

    register({
        id: "midpoint",
        label: "Środek odcinka",
        resultType: "geometry.midpoint",
        inputFields: ["source", "target"],
        inputType: "geometry.point",
        help: "Wskaż dwa różne punkty geometryczne. Wynik aktualizuje się automatycznie.",
    });


    register({
        id: "line_intersection",
        label: "Punkt przecięcia prostych",
        resultType: "geometry.line_intersection",
        inputFields: ["a1", "a2", "b1", "b2"],
        inputType: "geometry.point",
        help: "Wskaż kolejno dwa punkty pierwszej prostej i dwa punkty drugiej prostej.",
    });

    if (global.RouteEditorPlugins) {
        global.RouteEditorPlugins.registerObjectType({
            id: "geometry.line_intersection",
            displayName: "Punkt przecięcia prostych",
            modes: ["geometry", "mixed"],
            dependencyFields: ["a1", "a2", "b1", "b2"],
            pointLike: true,
            positioned: true,
            resolvePosition({object, findObject, resolvePosition}) {
                const fields = ["a1", "a2", "b1", "b2"];
                const points = fields.map((field) => resolvePosition(findObject(object.data && object.data[field])));
                if (points.some((point) => !point)) { return null; }
                const [p1, p2, p3, p4] = points;
                const denominator = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
                if (Math.abs(denominator) < 1e-9) { return null; }
                const determinant1 = p1.x * p2.y - p1.y * p2.x;
                const determinant2 = p3.x * p4.y - p3.y * p4.x;
                return {
                    x: (determinant1 * (p3.x - p4.x) - (p1.x - p2.x) * determinant2) / denominator,
                    y: (determinant1 * (p3.y - p4.y) - (p1.y - p2.y) * determinant2) / denominator,
                };
            },
        });
    }

    register({
        id: "perpendicular_projection",
        label: "Rzut prostokątny na prostą",
        resultType: "geometry.perpendicular_projection",
        inputFields: ["point", "lineA", "lineB"],
        inputType: "geometry.point",
        help: "Wskaż punkt rzutowany, a następnie dwa różne punkty wyznaczające prostą.",
    });

    if (global.RouteEditorPlugins) {
        global.RouteEditorPlugins.registerObjectType({
            id: "geometry.perpendicular_projection",
            displayName: "Rzut prostokątny na prostą",
            modes: ["geometry", "mixed"],
            dependencyFields: ["point", "lineA", "lineB"],
            pointLike: true,
            positioned: true,
            resolvePosition({object, findObject, resolvePosition}) {
                const data = object.data || {};
                const point = resolvePosition(findObject(data.point));
                const a = resolvePosition(findObject(data.lineA));
                const b = resolvePosition(findObject(data.lineB));
                if (!point || !a || !b) { return null; }
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const denominator = dx * dx + dy * dy;
                if (denominator < 1e-12) { return null; }
                const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator;
                return {x: a.x + t * dx, y: a.y + t * dy};
            },
        });
    }


    register({
        id: "circle_nearest_point",
        label: "Najbliższy punkt na okręgu",
        resultType: "geometry.circle_nearest_point",
        inputFields: ["point", "center", "radiusPoint"],
        inputType: "geometry.point",
        help: "Wskaż punkt, środek okręgu i punkt wyznaczający promień.",
    });

    if (global.RouteEditorPlugins) {
        global.RouteEditorPlugins.registerObjectType({
            id: "geometry.circle_nearest_point",
            displayName: "Najbliższy punkt na okręgu",
            modes: ["geometry", "mixed"],
            dependencyFields: ["point", "center", "radiusPoint"],
            pointLike: true,
            positioned: true,
            resolvePosition({object, findObject, resolvePosition}) {
                const data = object.data || {};
                const point = resolvePosition(findObject(data.point));
                const center = resolvePosition(findObject(data.center));
                const radiusPoint = resolvePosition(findObject(data.radiusPoint));
                if (!point || !center || !radiusPoint) { return null; }
                const radius = Math.hypot(radiusPoint.x - center.x, radiusPoint.y - center.y);
                const distance = Math.hypot(point.x - center.x, point.y - center.y);
                if (radius < 1e-12 || distance < 1e-12) { return null; }
                return {
                    x: center.x + radius * (point.x - center.x) / distance,
                    y: center.y + radius * (point.y - center.y) / distance,
                };
            },
        });
    }

    register({
        id: "line_circle_intersection",
        label: "Przecięcie prostej i okręgu",
        resultType: "geometry.line_circle_intersection",
        inputFields: ["lineA", "lineB", "center", "radiusPoint"],
        inputType: "geometry.point",
        parameterFields: ["branch"],
        help: "Wskaż dwa punkty prostej, środek okręgu i punkt wyznaczający promień.",
    });

    if (global.RouteEditorPlugins) {
        global.RouteEditorPlugins.registerObjectType({
            id: "geometry.line_circle_intersection",
            displayName: "Przecięcie prostej i okręgu",
            modes: ["geometry", "mixed"],
            dependencyFields: ["lineA", "lineB", "center", "radiusPoint"],
            pointLike: true,
            positioned: true,
            resolvePosition({object, findObject, resolvePosition}) {
                const data = object.data || {};
                const a = resolvePosition(findObject(data.lineA));
                const b = resolvePosition(findObject(data.lineB));
                const center = resolvePosition(findObject(data.center));
                const radiusPoint = resolvePosition(findObject(data.radiusPoint));
                if (!a || !b || !center || !radiusPoint) { return null; }
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const qa = dx * dx + dy * dy;
                const radiusSq = (radiusPoint.x - center.x) ** 2 + (radiusPoint.y - center.y) ** 2;
                if (qa < 1e-12 || radiusSq < 1e-12) { return null; }
                const fx = a.x - center.x;
                const fy = a.y - center.y;
                const qb = 2 * (fx * dx + fy * dy);
                const qc = fx * fx + fy * fy - radiusSq;
                const discriminant = qb * qb - 4 * qa * qc;
                if (discriminant < -1e-9) { return null; }
                const branch = Number(data.branch || 1);
                const root = Math.sqrt(Math.max(0, discriminant));
                let t;
                if (Math.abs(discriminant) <= 1e-9 || branch === 0) {
                    t = -qb / (2 * qa);
                } else {
                    t = (-qb + (branch < 0 ? -root : root)) / (2 * qa);
                }
                return {x: a.x + t * dx, y: a.y + t * dy};
            },
        });
    }

    register({
        id: "circle_circle_intersection",
        label: "Przecięcie dwóch okręgów",
        resultType: "geometry.circle_circle_intersection",
        inputFields: ["centerA", "radiusPointA", "centerB", "radiusPointB"],
        inputType: "geometry.point",
        parameterFields: ["branch"],
        help: "Wskaż środek i punkt promienia pierwszego okręgu, a następnie środek i punkt promienia drugiego.",
    });

    if (global.RouteEditorPlugins) {
        global.RouteEditorPlugins.registerObjectType({
            id: "geometry.circle_circle_intersection",
            displayName: "Przecięcie dwóch okręgów",
            modes: ["geometry", "mixed"],
            dependencyFields: ["centerA", "radiusPointA", "centerB", "radiusPointB"],
            pointLike: true,
            positioned: true,
            resolvePosition({object, findObject, resolvePosition}) {
                const data = object.data || {};
                const ca = resolvePosition(findObject(data.centerA));
                const ra = resolvePosition(findObject(data.radiusPointA));
                const cb = resolvePosition(findObject(data.centerB));
                const rb = resolvePosition(findObject(data.radiusPointB));
                if (!ca || !ra || !cb || !rb) { return null; }
                const r0 = Math.hypot(ra.x-ca.x, ra.y-ca.y);
                const r1 = Math.hypot(rb.x-cb.x, rb.y-cb.y);
                const dx = cb.x-ca.x, dy = cb.y-ca.y;
                const d = Math.hypot(dx, dy), eps = 1e-9;
                if (r0 < eps || r1 < eps || d < eps || d > r0+r1+eps || d < Math.abs(r0-r1)-eps) { return null; }
                const a = (r0*r0-r1*r1+d*d)/(2*d);
                const h2 = r0*r0-a*a;
                if (h2 < -eps) { return null; }
                const h = Math.sqrt(Math.max(0,h2));
                const xm = ca.x+a*dx/d, ym = ca.y+a*dy/d;
                const branch = Number(data.branch || 1);
                if (h <= eps || branch === 0) { return {x:xm,y:ym}; }
                const sign = branch < 0 ? -1 : 1;
                return {x:xm + sign*(-dy)*h/d, y:ym + sign*dx*h/d};
            },
        });
    }

    register({
        id: "segment_projection",
        label: "Najbliższy punkt na odcinku",
        resultType: "geometry.segment_projection",
        inputFields: ["point", "segmentA", "segmentB"],
        inputType: "geometry.point",
        help: "Wskaż punkt, a następnie dwa różne końce odcinka. Wynik pozostaje na odcinku.",
    });

    if (global.RouteEditorPlugins) {
        global.RouteEditorPlugins.registerObjectType({
            id: "geometry.segment_projection",
            displayName: "Najbliższy punkt na odcinku",
            modes: ["geometry", "mixed"],
            dependencyFields: ["point", "segmentA", "segmentB"],
            pointLike: true,
            positioned: true,
            resolvePosition({object, findObject, resolvePosition}) {
                const data = object.data || {};
                const point = resolvePosition(findObject(data.point));
                const a = resolvePosition(findObject(data.segmentA));
                const b = resolvePosition(findObject(data.segmentB));
                if (!point || !a || !b) { return null; }
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const denominator = dx * dx + dy * dy;
                if (denominator < 1e-12) { return null; }
                const rawT = ((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator;
                const t = Math.max(0, Math.min(1, rawT));
                return {x: a.x + t * dx, y: a.y + t * dy};
            },
        });
    }



    register({
        id: "circumcenter",
        label: "Środek okręgu opisanego",
        resultType: "geometry.circumcenter",
        inputFields: ["pointA", "pointB", "pointC"],
        inputType: "geometry.point",
        parameterFields: [],
        help: "Wskaż trzy różne, niewspółliniowe punkty. Wynik jest środkiem okręgu przechodzącego przez te punkty.",
    });

    if (global.RouteEditorPlugins) {
        global.RouteEditorPlugins.registerObjectType({
            id: "geometry.circumcenter",
            displayName: "Środek okręgu opisanego",
            modes: ["geometry", "mixed"],
            dependencyFields: ["pointA", "pointB", "pointC"],
            pointLike: true,
            positioned: true,
            resolvePosition({object, findObject, resolvePosition}) {
                const data = object.data || {};
                const a = resolvePosition(findObject(data.pointA));
                const b = resolvePosition(findObject(data.pointB));
                const c = resolvePosition(findObject(data.pointC));
                if (!a || !b || !c) { return null; }
                const denominator = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
                if (Math.abs(denominator) < 1e-12) { return null; }
                const aSq = a.x * a.x + a.y * a.y;
                const bSq = b.x * b.x + b.y * b.y;
                const cSq = c.x * c.x + c.y * c.y;
                return {
                    x: (aSq * (b.y - c.y) + bSq * (c.y - a.y) + cSq * (a.y - b.y)) / denominator,
                    y: (aSq * (c.x - b.x) + bSq * (a.x - c.x) + cSq * (b.x - a.x)) / denominator,
                };
            },
        });
    }

    register({
        id: "orthocenter",
        label: "Ortocentrum trójkąta",
        resultType: "geometry.orthocenter",
        inputFields: ["pointA", "pointB", "pointC"],
        inputType: "geometry.point",
        parameterFields: [],
        help: "Wskaż trzy różne, niewspółliniowe punkty. Wynik jest punktem przecięcia wysokości trójkąta.",
    });

    if (global.RouteEditorPlugins) {
        global.RouteEditorPlugins.registerObjectType({
            id: "geometry.orthocenter",
            displayName: "Ortocentrum trójkąta",
            modes: ["geometry", "mixed"],
            dependencyFields: ["pointA", "pointB", "pointC"],
            pointLike: true,
            positioned: true,
            resolvePosition({object, findObject, resolvePosition}) {
                const data = object.data || {};
                const a = resolvePosition(findObject(data.pointA));
                const b = resolvePosition(findObject(data.pointB));
                const c = resolvePosition(findObject(data.pointC));
                if (!a || !b || !c) { return null; }
                const denominator = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
                if (Math.abs(denominator) < 1e-12) { return null; }
                const aSq = a.x * a.x + a.y * a.y;
                const bSq = b.x * b.x + b.y * b.y;
                const cSq = c.x * c.x + c.y * c.y;
                const ox = (aSq * (b.y - c.y) + bSq * (c.y - a.y) + cSq * (a.y - b.y)) / denominator;
                const oy = (aSq * (c.x - b.x) + bSq * (a.x - c.x) + cSq * (b.x - a.x)) / denominator;
                return {x: a.x + b.x + c.x - 2 * ox, y: a.y + b.y + c.y - 2 * oy};
            },
        });
    }


    register({
        id: "nine_point_center",
        label: "Środek okręgu dziewięciu punktów",
        resultType: "geometry.nine_point_center",
        inputFields: ["pointA", "pointB", "pointC"],
        inputType: "geometry.point",
        parameterFields: [],
        help: "Wskaż trzy różne, niewspółliniowe punkty. Wynik jest środkiem okręgu dziewięciu punktów trójkąta.",
    });

    if (global.RouteEditorPlugins) {
        global.RouteEditorPlugins.registerObjectType({
            id: "geometry.nine_point_center",
            displayName: "Środek okręgu dziewięciu punktów",
            modes: ["geometry", "mixed"],
            dependencyFields: ["pointA", "pointB", "pointC"],
            pointLike: true,
            positioned: true,
            resolvePosition({object, findObject, resolvePosition}) {
                const data = object.data || {};
                const a = resolvePosition(findObject(data.pointA));
                const b = resolvePosition(findObject(data.pointB));
                const c = resolvePosition(findObject(data.pointC));
                if (!a || !b || !c) { return null; }
                const denominator = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
                if (Math.abs(denominator) < 1e-12) { return null; }
                const aSq = a.x * a.x + a.y * a.y;
                const bSq = b.x * b.x + b.y * b.y;
                const cSq = c.x * c.x + c.y * c.y;
                const ox = (aSq * (b.y - c.y) + bSq * (c.y - a.y) + cSq * (a.y - b.y)) / denominator;
                const oy = (aSq * (c.x - b.x) + bSq * (a.x - c.x) + cSq * (b.x - a.x)) / denominator;
                const hx = a.x + b.x + c.x - 2 * ox;
                const hy = a.y + b.y + c.y - 2 * oy;
                return {x: (ox + hx) / 2, y: (oy + hy) / 2};
            },
        });
    }

    register({
        id: "centroid",
        label: "Środek ciężkości trójkąta",
        resultType: "geometry.centroid",
        inputFields: ["pointA", "pointB", "pointC"],
        inputType: "geometry.point",
        parameterFields: [],
        help: "Wskaż trzy różne punkty. Wynik jest punktem przecięcia środkowych trójkąta.",
    });

    if (global.RouteEditorPlugins) {
        global.RouteEditorPlugins.registerObjectType({
            id: "geometry.centroid",
            displayName: "Środek ciężkości trójkąta",
            modes: ["geometry", "mixed"],
            dependencyFields: ["pointA", "pointB", "pointC"],
            pointLike: true,
            positioned: true,
            resolvePosition({object, findObject, resolvePosition}) {
                const data = object.data || {};
                const a = resolvePosition(findObject(data.pointA));
                const b = resolvePosition(findObject(data.pointB));
                const c = resolvePosition(findObject(data.pointC));
                if (!a || !b || !c) { return null; }
                return {x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3};
            },
        });
    }

    register({
        id: "incenter",
        label: "Środek okręgu wpisanego w trójkąt",
        resultType: "geometry.incenter",
        inputFields: ["pointA", "pointB", "pointC"],
        inputType: "geometry.point",
        parameterFields: [],
        help: "Wskaż trzy różne, niewspółliniowe punkty. Wynik jest środkiem okręgu wpisanego w trójkąt.",
    });

    if (global.RouteEditorPlugins) {
        global.RouteEditorPlugins.registerObjectType({
            id: "geometry.incenter",
            displayName: "Środek okręgu wpisanego w trójkąt",
            modes: ["geometry", "mixed"],
            dependencyFields: ["pointA", "pointB", "pointC"],
            pointLike: true,
            positioned: true,
            resolvePosition({object, findObject, resolvePosition}) {
                const data = object.data || {};
                const a = resolvePosition(findObject(data.pointA));
                const b = resolvePosition(findObject(data.pointB));
                const c = resolvePosition(findObject(data.pointC));
                if (!a || !b || !c) { return null; }
                const sideA = Math.hypot(b.x - c.x, b.y - c.y);
                const sideB = Math.hypot(a.x - c.x, a.y - c.y);
                const sideC = Math.hypot(a.x - b.x, a.y - b.y);
                const perimeter = sideA + sideB + sideC;
                const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
                if (perimeter < 1e-12 || area2 < 1e-12) { return null; }
                return {
                    x: (sideA * a.x + sideB * b.x + sideC * c.x) / perimeter,
                    y: (sideA * a.y + sideB * b.y + sideC * c.y) / perimeter,
                };
            },
        });
    }


    register({
        id: "excenter",
        label: "Środek okręgu dopisanego do trójkąta",
        resultType: "geometry.excenter",
        inputFields: ["pointA", "pointB", "pointC"],
        inputType: "geometry.point",
        parameterFields: ["oppositeVertex"],
        help: "Wskaż trzy różne, niewspółliniowe punkty i wybierz wierzchołek A, B lub C.",
    });

    if (global.RouteEditorPlugins) {
        global.RouteEditorPlugins.registerObjectType({
            id: "geometry.excenter",
            displayName: "Środek okręgu dopisanego do trójkąta",
            modes: ["geometry", "mixed"],
            dependencyFields: ["pointA", "pointB", "pointC"],
            pointLike: true,
            positioned: true,
            propertyFields: [
                {key: "oppositeVertex", label: "Wierzchołek przeciwny", type: "select", path: "data.oppositeVertex", options: [
                    {value: "A", label: "A"}, {value: "B", label: "B"}, {value: "C", label: "C"}
                ]},
                {key: "label", label: "Etykieta", type: "text", path: "data.label"}
            ],
            resolvePosition({object, findObject, resolvePosition}) {
                const d = object.data || {};
                const A = resolvePosition(findObject(d.pointA));
                const B = resolvePosition(findObject(d.pointB));
                const C = resolvePosition(findObject(d.pointC));
                if (!A || !B || !C) { return null; }
                const area2 = Math.abs((B.x-A.x)*(C.y-A.y) - (B.y-A.y)*(C.x-A.x));
                if (area2 < 1e-12) { return null; }
                const a = Math.hypot(B.x-C.x, B.y-C.y);
                const b = Math.hypot(A.x-C.x, A.y-C.y);
                const c = Math.hypot(A.x-B.x, A.y-B.y);
                const weights = {A:[-a,b,c], B:[a,-b,c], C:[a,b,-c]}[d.oppositeVertex];
                if (!weights) { return null; }
                const den = weights[0] + weights[1] + weights[2];
                if (Math.abs(den) < 1e-12) { return null; }
                return {
                    x: (weights[0]*A.x + weights[1]*B.x + weights[2]*C.x) / den,
                    y: (weights[0]*A.y + weights[1]*B.y + weights[2]*C.y) / den,
                };
            },
        });
    }

    register({
        id: "excircle_touchpoint",
        label: "Punkt styczności okręgu dopisanego",
        resultType: "geometry.excircle_touchpoint",
        inputFields: ["pointA", "pointB", "pointC"],
        inputType: "geometry.point",
        parameterFields: ["oppositeVertex", "side"],
        help: "Wskaż trzy różne, niewspółliniowe punkty, wybierz okrąg dopisany A/B/C oraz bok AB/BC/CA.",
    });

    if (global.RouteEditorPlugins) {
        global.RouteEditorPlugins.registerObjectType({
            id: "geometry.excircle_touchpoint",
            displayName: "Punkt styczności okręgu dopisanego",
            modes: ["geometry", "mixed"],
            dependencyFields: ["pointA", "pointB", "pointC"],
            pointLike: true,
            positioned: true,
            propertyFields: [
                {key: "oppositeVertex", label: "Okrąg dopisany", type: "select", path: "data.oppositeVertex", options: [
                    {value: "A", label: "I_A"}, {value: "B", label: "I_B"}, {value: "C", label: "I_C"}
                ]},
                {key: "side", label: "Bok / jego przedłużenie", type: "select", path: "data.side", options: [
                    {value: "AB", label: "AB"}, {value: "BC", label: "BC"}, {value: "CA", label: "CA"}
                ]},
                {key: "label", label: "Etykieta", type: "text", path: "data.label"}
            ],
            resolvePosition({object, findObject, resolvePosition}) {
                const d = object.data || {};
                const A = resolvePosition(findObject(d.pointA));
                const B = resolvePosition(findObject(d.pointB));
                const C = resolvePosition(findObject(d.pointC));
                if (!A || !B || !C) { return null; }
                const area2 = Math.abs((B.x-A.x)*(C.y-A.y) - (B.y-A.y)*(C.x-A.x));
                if (area2 < 1e-12) { return null; }
                const a = Math.hypot(B.x-C.x, B.y-C.y);
                const b = Math.hypot(A.x-C.x, A.y-C.y);
                const c = Math.hypot(A.x-B.x, A.y-B.y);
                const weights = {A:[-a,b,c], B:[a,-b,c], C:[a,b,-c]}[d.oppositeVertex];
                if (!weights) { return null; }
                const den = weights[0]+weights[1]+weights[2];
                if (Math.abs(den) < 1e-12) { return null; }
                const E = {x:(weights[0]*A.x+weights[1]*B.x+weights[2]*C.x)/den, y:(weights[0]*A.y+weights[1]*B.y+weights[2]*C.y)/den};
                const pair = {AB:[A,B], BC:[B,C], CA:[C,A]}[d.side];
                if (!pair) { return null; }
                const [P,Q]=pair, dx=Q.x-P.x, dy=Q.y-P.y, denom=dx*dx+dy*dy;
                if (denom < 1e-12) { return null; }
                const t=((E.x-P.x)*dx+(E.y-P.y)*dy)/denom;
                return {x:P.x+t*dx, y:P.y+t*dy};
            },
        });
    }

    register({
        id: "incircle_touchpoint",
        label: "Punkt styczności okręgu wpisanego",
        resultType: "geometry.incircle_touchpoint",
        inputFields: ["pointA", "pointB", "pointC"],
        inputType: "geometry.point",
        parameterFields: ["side"],
        help: "Wskaż trzy różne, niewspółliniowe punkty i wybierz bok AB, BC lub CA.",
    });

    if (global.RouteEditorPlugins) {
        global.RouteEditorPlugins.registerObjectType({
            id: "geometry.incircle_touchpoint",
            displayName: "Punkt styczności okręgu wpisanego",
            modes: ["geometry", "mixed"],
            dependencyFields: ["pointA", "pointB", "pointC"],
            pointLike: true,
            positioned: true,
            propertyFields: [
                {key: "side", label: "Bok styczności", type: "select", path: "data.side", options: [
                    {value: "AB", label: "AB"}, {value: "BC", label: "BC"}, {value: "CA", label: "CA"}
                ]},
                {key: "label", label: "Etykieta", type: "text", path: "data.label"}
            ],
            resolvePosition({object, findObject, resolvePosition}) {
                const d = object.data || {};
                const A = resolvePosition(findObject(d.pointA));
                const B = resolvePosition(findObject(d.pointB));
                const C = resolvePosition(findObject(d.pointC));
                if (!A || !B || !C) { return null; }
                const area2 = Math.abs((B.x-A.x)*(C.y-A.y) - (B.y-A.y)*(C.x-A.x));
                if (area2 < 1e-12) { return null; }
                const a = Math.hypot(B.x-C.x, B.y-C.y);
                const b = Math.hypot(A.x-C.x, A.y-C.y);
                const c = Math.hypot(A.x-B.x, A.y-B.y);
                const p = a+b+c;
                if (p < 1e-12) { return null; }
                const I = {x:(a*A.x+b*B.x+c*C.x)/p, y:(a*A.y+b*B.y+c*C.y)/p};
                const pairs = {AB:[A,B], BC:[B,C], CA:[C,A]};
                const pair = pairs[d.side];
                if (!pair) { return null; }
                const [P,Q]=pair, dx=Q.x-P.x, dy=Q.y-P.y, den=dx*dx+dy*dy;
                if (den < 1e-12) { return null; }
                const t=((I.x-P.x)*dx+(I.y-P.y)*dy)/den;
                return {x:P.x+t*dx, y:P.y+t*dy};
            },
        });
    }

    register({
        id: "reflection_across_line",
        label: "Odbicie punktu względem prostej",
        resultType: "geometry.reflection_across_line",
        inputFields: ["point", "lineA", "lineB"],
        inputType: "geometry.point",
        help: "Wskaż punkt odbijany, a następnie dwa różne punkty wyznaczające prostą odbicia.",
    });

    if (global.RouteEditorPlugins) {
        global.RouteEditorPlugins.registerObjectType({
            id: "geometry.reflection_across_line",
            displayName: "Odbicie punktu względem prostej",
            modes: ["geometry", "mixed"],
            dependencyFields: ["point", "lineA", "lineB"],
            pointLike: true,
            positioned: true,
            resolvePosition({object, findObject, resolvePosition}) {
                const data = object.data || {};
                const point = resolvePosition(findObject(data.point));
                const a = resolvePosition(findObject(data.lineA));
                const b = resolvePosition(findObject(data.lineB));
                if (!point || !a || !b) { return null; }
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const denominator = dx * dx + dy * dy;
                if (denominator < 1e-12) { return null; }
                const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator;
                const hx = a.x + t * dx;
                const hy = a.y + t * dy;
                return {x: 2 * hx - point.x, y: 2 * hy - point.y};
            },
        });
    }


    register({
        id: "rotation_around_point",
        label: "Obrót punktu wokół środka",
        resultType: "geometry.rotation_around_point",
        inputFields: ["point", "center"],
        inputType: "geometry.point",
        parameterFields: ["angleDegrees"],
        help: "Wskaż punkt obracany, środek obrotu i podaj kąt w stopniach.",
    });

    if (global.RouteEditorPlugins) {
        global.RouteEditorPlugins.registerObjectType({
            id: "geometry.rotation_around_point",
            displayName: "Obrót punktu wokół środka",
            modes: ["geometry", "mixed"],
            dependencyFields: ["point", "center"],
            pointLike: true,
            positioned: true,
            propertyFields: [
                {
                    key: "angleDegrees",
                    label: "Kąt obrotu [°]",
                    type: "number",
                    path: "data.angleDegrees",
                    step: 1,
                    help: "Dodatni kąt oznacza obrót przeciwnie do ruchu wskazówek zegara.",
                    validate(value) { return Number.isFinite(Number(value)) ? null : "Kąt musi być liczbą."; },
                },
                {key: "label", label: "Etykieta", type: "text", path: "data.label"},
            ],
            resolvePosition({object, findObject, resolvePosition}) {
                const data = object.data || {};
                const point = resolvePosition(findObject(data.point));
                const center = resolvePosition(findObject(data.center));
                const angleDegrees = Number(data.angleDegrees);
                if (!point || !center || !Number.isFinite(angleDegrees)) { return null; }
                const angle = angleDegrees * Math.PI / 180;
                const dx = point.x - center.x;
                const dy = point.y - center.y;
                return {
                    x: center.x + Math.cos(angle) * dx - Math.sin(angle) * dy,
                    y: center.y + Math.sin(angle) * dx + Math.cos(angle) * dy,
                };
            },
        });
    }


    register({
        id: "central_reflection",
        label: "Symetria środkowa punktu",
        resultType: "geometry.central_reflection",
        inputFields: ["point", "center"],
        inputType: "geometry.point",
        parameterFields: [],
        help: "Wskaż punkt odbijany i środek symetrii.",
    });

    if (global.RouteEditorPlugins) {
        global.RouteEditorPlugins.registerObjectType({
            id: "geometry.central_reflection",
            displayName: "Symetria środkowa punktu",
            modes: ["geometry", "mixed"],
            dependencyFields: ["point", "center"],
            pointLike: true,
            positioned: true,
            propertyFields: [
                {key: "label", label: "Etykieta", type: "text", path: "data.label"},
            ],
            resolvePosition({object, findObject, resolvePosition}) {
                const data = object.data || {};
                const point = resolvePosition(findObject(data.point));
                const center = resolvePosition(findObject(data.center));
                if (!point || !center) { return null; }
                return {x: 2 * center.x - point.x, y: 2 * center.y - point.y};
            },
        });
    }


    register({
        id: "homothety",
        label: "Jednokładność punktu względem środka",
        resultType: "geometry.homothety",
        inputFields: ["point", "center"],
        inputType: "geometry.point",
        parameterFields: ["scaleFactor"],
        help: "Wskaż punkt, środek jednokładności i podaj współczynnik k.",
    });

    if (global.RouteEditorPlugins) {
        global.RouteEditorPlugins.registerObjectType({
            id: "geometry.homothety",
            displayName: "Jednokładność punktu względem środka",
            modes: ["geometry", "mixed"],
            dependencyFields: ["point", "center"],
            pointLike: true,
            positioned: true,
            propertyFields: [
                {key: "scaleFactor", label: "Współczynnik k", type: "number", path: "data.scaleFactor", step: 0.1,
                 help: "k=1 pozostawia punkt bez zmian, k=0 daje środek, k=-1 daje symetrię środkową.",
                 validate(value) { return Number.isFinite(Number(value)) ? null : "Współczynnik k musi być liczbą."; }},
                {key: "label", label: "Etykieta", type: "text", path: "data.label"},
            ],
            resolvePosition({object, findObject, resolvePosition}) {
                const data = object.data || {};
                const point = resolvePosition(findObject(data.point));
                const center = resolvePosition(findObject(data.center));
                const scale = Number(data.scaleFactor);
                if (!point || !center || !Number.isFinite(scale)) { return null; }
                return {x: center.x + scale * (point.x - center.x), y: center.y + scale * (point.y - center.y)};
            },
        });
    }


    register({
        id: "translation_by_vector",
        label: "Translacja punktu o wektor",
        resultType: "geometry.translation_by_vector",
        inputFields: ["point", "vectorStart", "vectorEnd"],
        inputType: "geometry.point",
        parameterFields: [],
        help: "Wskaż punkt przesuwany, a następnie początek i koniec wektora translacji.",
    });

    if (global.RouteEditorPlugins) {
        global.RouteEditorPlugins.registerObjectType({
            id: "geometry.translation_by_vector",
            displayName: "Translacja punktu o wektor",
            modes: ["geometry", "mixed"],
            dependencyFields: ["point", "vectorStart", "vectorEnd"],
            pointLike: true,
            positioned: true,
            propertyFields: [
                {key: "label", label: "Etykieta", type: "text", path: "data.label"},
            ],
            resolvePosition({object, findObject, resolvePosition}) {
                const data = object.data || {};
                const point = resolvePosition(findObject(data.point));
                const vectorStart = resolvePosition(findObject(data.vectorStart));
                const vectorEnd = resolvePosition(findObject(data.vectorEnd));
                if (!point || !vectorStart || !vectorEnd) { return null; }
                return {
                    x: point.x + vectorEnd.x - vectorStart.x,
                    y: point.y + vectorEnd.y - vectorStart.y,
                };
            },
        });
    }

    global.RouteEditorGeometryCommands = Object.freeze({register, get, all, forResultType});
}(window));
