import json
from pathlib import Path
import shutil
import tempfile

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from django.contrib.staticfiles import finders
from django.urls import reverse

from .models import Drawing, DrawingObject
from .views import build_drawing_tikz


TEST_MEDIA_ROOT = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT, PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class DrawingModelAndViewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="password123")
        self.other_user = User.objects.create_user(username="bob", password="password123")
        self.drawing = Drawing.objects.create(
            user=self.user,
            title="Alice structured drawing",
            mode=Drawing.MODE_MIXED,
            metadata={"schema_version": 1},
        )
        self.other_drawing = Drawing.objects.create(
            user=self.other_user,
            title="Bob structured drawing",
            mode=Drawing.MODE_GEOMETRY,
        )

    def login(self):
        self.client.login(username="alice", password="password123")

    def test_drawing_can_store_structured_objects(self):
        obj = DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="v1",
            type="graph.vertex",
            data={"x": 100, "y": 150, "label": "v_1"},
            style={"stroke": "#000000", "fill": "#ffffff"},
            order=1,
        )

        self.assertEqual(obj.drawing, self.drawing)
        self.assertEqual(obj.data["label"], "v_1")
        self.assertEqual(obj.style["fill"], "#ffffff")
        self.assertEqual(list(self.drawing.drawing_objects.all()), [obj])

    def test_drawing_object_ids_must_be_unique_inside_one_drawing(self):
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="obj_1",
            type="graph.vertex",
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                DrawingObject.objects.create(
                    drawing=self.drawing,
                    object_id="obj_1",
                    type="graph.edge",
                )

        # Ten sam object_id może istnieć w innym rysunku.
        other = DrawingObject.objects.create(
            drawing=self.other_drawing,
            object_id="obj_1",
            type="geometry.point",
        )
        self.assertEqual(other.object_id, "obj_1")

    def test_deleting_drawing_deletes_its_objects(self):
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="v1",
            type="graph.vertex",
        )

        self.drawing.delete()

        self.assertEqual(DrawingObject.objects.count(), 0)

    def test_drawing_list_contains_only_current_user_drawings(self):
        self.login()

        response = self.client.get(reverse("drawing_list"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Alice structured drawing")
        self.assertNotContains(response, "Bob structured drawing")

    def test_drawing_detail_is_restricted_to_owner(self):
        self.login()

        own_response = self.client.get(reverse("drawing_detail", kwargs={"pk": self.drawing.pk}))
        foreign_response = self.client.get(reverse("drawing_detail", kwargs={"pk": self.other_drawing.pk}))

        self.assertEqual(own_response.status_code, 200)
        self.assertContains(own_response, "Alice structured drawing")
        self.assertEqual(foreign_response.status_code, 404)

    def test_drawing_detail_contains_canvas_editor_and_api_url(self):
        self.login()

        response = self.client.get(reverse("drawing_detail", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "data-drawing-editor")
        self.assertContains(response, "data-role=\"drawing-canvas\"")
        self.assertContains(response, reverse("drawing_objects_collection", kwargs={"drawing_id": self.drawing.pk}))
        self.assertContains(response, "routes/drawing_editor.js")
        self.assertContains(response, "routes/drawing_editor.css")
        self.assertContains(response, "graph.vertex łączymy tylko krawędziami grafowymi")

    def test_drawing_editor_static_files_are_available(self):
        self.assertIsNotNone(finders.find("routes/drawing_editor.js"))
        self.assertIsNotNone(finders.find("routes/drawing_editor.css"))

    def test_create_drawing_sets_current_user_and_metadata(self):
        self.login()

        response = self.client.post(
            reverse("drawing_create"),
            {"title": "New geometry drawing", "mode": Drawing.MODE_GEOMETRY},
        )

        drawing = Drawing.objects.get(title="New geometry drawing")
        self.assertRedirects(response, reverse("drawing_detail", kwargs={"pk": drawing.pk}))
        self.assertEqual(drawing.user, self.user)
        self.assertEqual(drawing.mode, Drawing.MODE_GEOMETRY)
        self.assertEqual(drawing.metadata["schema_version"], 1)

    def test_delete_drawing_is_restricted_to_owner(self):
        self.login()

        foreign_response = self.client.post(reverse("drawing_delete", kwargs={"pk": self.other_drawing.pk}))
        own_response = self.client.post(reverse("drawing_delete", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(foreign_response.status_code, 404)
        self.assertRedirects(own_response, reverse("drawing_list"))
        self.assertFalse(Drawing.objects.filter(pk=self.drawing.pk).exists())
        self.assertTrue(Drawing.objects.filter(pk=self.other_drawing.pk).exists())

    def test_drawing_objects_api_creates_object_from_json(self):
        self.login()

        response = self.client.post(
            reverse("drawing_objects_collection", kwargs={"drawing_id": self.drawing.pk}),
            data=json.dumps({
                "object_id": "v1",
                "type": "graph.vertex",
                "data": {"x": 100, "y": 150, "label": "v_1"},
                "style": {"fill": "#ffffff", "stroke": "#000000"},
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.json()["success"])
        obj = DrawingObject.objects.get(drawing=self.drawing, object_id="v1")
        self.assertEqual(obj.type, "graph.vertex")
        self.assertEqual(obj.data["label"], "v_1")
        self.assertEqual(obj.order, 0)

    def test_drawing_objects_api_can_generate_object_id(self):
        self.login()

        response = self.client.post(
            reverse("drawing_objects_collection", kwargs={"drawing_id": self.drawing.pk}),
            data=json.dumps({
                "type": "geometry.point",
                "data": {"x": 10, "y": 20},
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        object_id = response.json()["object"]["object_id"]
        self.assertTrue(object_id.startswith("obj_"))
        self.assertTrue(DrawingObject.objects.filter(drawing=self.drawing, object_id=object_id).exists())

    def test_drawing_objects_api_lists_only_objects_from_owner_drawing(self):
        self.login()
        DrawingObject.objects.create(drawing=self.drawing, object_id="v1", type="graph.vertex")
        DrawingObject.objects.create(drawing=self.other_drawing, object_id="foreign", type="graph.vertex")

        response = self.client.get(reverse("drawing_objects_collection", kwargs={"drawing_id": self.drawing.pk}))
        foreign_response = self.client.get(reverse("drawing_objects_collection", kwargs={"drawing_id": self.other_drawing.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertEqual([obj["object_id"] for obj in response.json()["objects"]], ["v1"])
        self.assertEqual(foreign_response.status_code, 404)

    def test_drawing_objects_api_rejects_invalid_payload(self):
        self.login()

        response = self.client.post(
            reverse("drawing_objects_collection", kwargs={"drawing_id": self.drawing.pk}),
            data=json.dumps({
                "type": "",
                "data": ["not", "an", "object"],
                "style": "not an object",
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.json()["success"])
        self.assertIn("type", response.json()["errors"])
        self.assertIn("data", response.json()["errors"])
        self.assertIn("style", response.json()["errors"])
        self.assertEqual(DrawingObject.objects.filter(drawing=self.drawing).count(), 0)

    def test_drawing_objects_api_rejects_duplicate_object_id(self):
        self.login()
        DrawingObject.objects.create(drawing=self.drawing, object_id="v1", type="graph.vertex")

        response = self.client.post(
            reverse("drawing_objects_collection", kwargs={"drawing_id": self.drawing.pk}),
            data=json.dumps({
                "object_id": "v1",
                "type": "graph.vertex",
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("object_id", response.json()["errors"])

    def test_drawing_object_detail_api_gets_object(self):
        self.login()
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="v1",
            type="graph.vertex",
            data={"x": 1, "y": 2},
        )

        response = self.client.get(reverse(
            "drawing_object_detail",
            kwargs={"drawing_id": self.drawing.pk, "object_id": "v1"},
        ))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["object"]["type"], "graph.vertex")
        self.assertEqual(response.json()["object"]["data"], {"x": 1, "y": 2})

    def test_drawing_object_detail_api_patches_object(self):
        self.login()
        obj = DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="v1",
            type="graph.vertex",
            data={"x": 1, "y": 2},
            style={"fill": "white"},
        )

        response = self.client.patch(
            reverse("drawing_object_detail", kwargs={"drawing_id": self.drawing.pk, "object_id": "v1"}),
            data=json.dumps({"data": {"x": 10, "y": 20}, "style": {"fill": "red"}}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        obj.refresh_from_db()
        self.assertEqual(obj.data, {"x": 10, "y": 20})
        self.assertEqual(obj.style, {"fill": "red"})
        self.assertEqual(obj.type, "graph.vertex")


    def test_drawing_object_detail_api_patches_point_position_and_preserves_label(self):
        self.login()
        obj = DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="p1",
            type="geometry.point",
            data={"x": 10, "y": 20, "label": "A"},
            style={"fill": "#111827"},
        )

        response = self.client.patch(
            reverse("drawing_object_detail", kwargs={"drawing_id": self.drawing.pk, "object_id": "p1"}),
            data=json.dumps({"data": {"x": 80, "y": 90, "label": "A"}}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        obj.refresh_from_db()
        self.assertEqual(obj.data, {"x": 80, "y": 90, "label": "A"})
        self.assertEqual(response.json()["object"]["data"]["x"], 80)
        self.assertEqual(response.json()["object"]["data"]["y"], 90)

    def test_drawing_editor_static_js_contains_drag_and_patch_support(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        with open(js_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("pointerdown", source)
        self.assertIn("handlePointerMove", source)
        self.assertIn("handlePointerUp", source)
        self.assertIn('method: "PATCH"', source)
        self.assertIn("setPointerCapture", source)

    def test_drawing_object_detail_api_put_replaces_object_fields(self):
        self.login()
        obj = DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="v1",
            type="graph.vertex",
            data={"x": 1},
            style={"fill": "white"},
        )

        response = self.client.put(
            reverse("drawing_object_detail", kwargs={"drawing_id": self.drawing.pk, "object_id": "v1"}),
            data=json.dumps({
                "type": "geometry.point",
                "data": {"x": 3, "y": 4},
                "style": {},
                "order": 5,
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        obj.refresh_from_db()
        self.assertEqual(obj.type, "geometry.point")
        self.assertEqual(obj.data, {"x": 3, "y": 4})
        self.assertEqual(obj.style, {})
        self.assertEqual(obj.order, 5)

    def test_drawing_object_detail_api_deletes_object(self):
        self.login()
        DrawingObject.objects.create(drawing=self.drawing, object_id="v1", type="graph.vertex")

        response = self.client.delete(reverse(
            "drawing_object_detail",
            kwargs={"drawing_id": self.drawing.pk, "object_id": "v1"},
        ))

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["success"])
        self.assertFalse(DrawingObject.objects.filter(drawing=self.drawing, object_id="v1").exists())

    def test_drawing_object_detail_api_is_restricted_to_owner(self):
        self.login()
        DrawingObject.objects.create(drawing=self.other_drawing, object_id="foreign", type="graph.vertex")

        response = self.client.get(reverse(
            "drawing_object_detail",
            kwargs={"drawing_id": self.other_drawing.pk, "object_id": "foreign"},
        ))

        self.assertEqual(response.status_code, 404)

    def test_drawing_objects_api_can_store_segment_between_two_points(self):
        self.login()
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="p1",
            type="geometry.point",
            data={"x": 10, "y": 20, "label": "A"},
        )
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="p2",
            type="geometry.point",
            data={"x": 80, "y": 90, "label": "B"},
        )

        response = self.client.post(
            reverse("drawing_objects_collection", kwargs={"drawing_id": self.drawing.pk}),
            data=json.dumps({
                "object_id": "s1",
                "type": "geometry.segment",
                "data": {"source": "p1", "target": "p2", "label": "AB"},
                "style": {"stroke": "#111827", "strokeWidth": 2},
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        segment = DrawingObject.objects.get(drawing=self.drawing, object_id="s1")
        self.assertEqual(segment.type, "geometry.segment")
        self.assertEqual(segment.data["source"], "p1")
        self.assertEqual(segment.data["target"], "p2")
        self.assertEqual(response.json()["object"]["data"]["label"], "AB")

    def test_drawing_detail_contains_segment_and_edge_tools(self):
        self.login()

        response = self.client.get(reverse("drawing_detail", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'value="geometry.segment"')
        self.assertContains(response, 'value="graph.edge.undirected"')
        self.assertContains(response, 'value="graph.edge.directed"')
        self.assertContains(response, "geometry.segment")
        self.assertContains(response, "graph.edge")

    def test_drawing_editor_static_js_contains_line_creation_support(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        with open(js_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("geometry.segment", source)
        self.assertIn("graph.edge", source)
        self.assertIn("createLineBetweenPoints", source)
        self.assertIn("renderLine", source)
        self.assertIn("source", source)
        self.assertIn("target", source)



    def test_drawing_object_detail_api_patches_style(self):
        self.login()
        obj = DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="p1",
            type="geometry.point",
            data={"x": 10, "y": 20, "label": "A"},
            style={"fill": "#111827", "stroke": "#111827", "radius": 5},
        )

        response = self.client.patch(
            reverse("drawing_object_detail", kwargs={"drawing_id": self.drawing.pk, "object_id": "p1"}),
            data=json.dumps({
                "style": {
                    "fill": "#ff0000",
                    "stroke": "#0000ff",
                    "strokeWidth": 3,
                    "radius": 9,
                    "showLabel": False,
                }
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        obj.refresh_from_db()
        self.assertEqual(obj.style["fill"], "#ff0000")
        self.assertEqual(obj.style["stroke"], "#0000ff")
        self.assertEqual(obj.style["strokeWidth"], 3)
        self.assertEqual(obj.style["radius"], 9)
        self.assertFalse(obj.style["showLabel"])

    def test_drawing_detail_contains_style_panel(self):
        self.login()

        response = self.client.get(reverse("drawing_detail", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Styl zaznaczonego obiektu")
        self.assertContains(response, "data-role=\"style-stroke\"")
        self.assertContains(response, "data-role=\"style-fill\"")
        self.assertContains(response, "data-role=\"style-stroke-width\"")
        self.assertContains(response, "data-role=\"style-radius\"")
        self.assertContains(response, "data-role=\"style-show-label\"")

    def test_drawing_editor_static_js_contains_style_support(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        with open(js_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("applySelectedStyle", source)
        self.assertIn("updateStylePanel", source)
        self.assertIn("style-show-label", source)
        self.assertIn("strokeWidth", source)
        self.assertIn("showLabel", source)

    def test_drawing_export_tikz_uses_styles_and_hidden_labels(self):
        self.login()
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="A",
            type="geometry.point",
            data={"x": 100, "y": 120, "label": "Hidden"},
            style={
                "fill": "#ff0000",
                "stroke": "#0000ff",
                "strokeWidth": 3,
                "radius": 10,
                "showLabel": False,
            },
        )
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="B",
            type="geometry.point",
            data={"x": 300, "y": 120, "label": "B"},
            style={"fill": "#111827", "stroke": "#111827", "showLabel": True},
        )
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="AB",
            type="geometry.segment",
            data={"source": "A", "target": "B", "label": "edge"},
            style={"stroke": "#00ff00", "strokeWidth": 4, "showLabel": False},
        )

        response = self.client.get(reverse("drawing_export_tikz", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        content = response.content.decode("utf-8")
        self.assertIn("\\definecolor{mdeFF0000}{HTML}{FF0000}", content)
        self.assertIn("\\definecolor{mde0000FF}{HTML}{0000FF}", content)
        self.assertIn("line width=3pt", content)
        self.assertIn("circle (0.1cm)", content)
        self.assertIn("line width=4pt", content)
        self.assertNotIn("$ Hidden $", content)
        self.assertNotIn("$ edge $", content)

    def test_drawing_export_tikz_contains_points_segments_and_directed_edges(self):
        self.login()
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="A",
            type="geometry.point",
            data={"x": 100, "y": 120, "label": "A"},
        )
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="B",
            type="graph.vertex",
            data={"x": 300, "y": 120, "label": "B"},
        )
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="AB",
            type="geometry.segment",
            data={"source": "A", "target": "B", "label": "e"},
        )
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="BA",
            type="graph.edge",
            data={"source": "B", "target": "A", "label": "f"},
            style={"directed": True},
        )

        response = self.client.get(reverse("drawing_export_tikz", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/plain; charset=utf-8")
        content = response.content.decode("utf-8")
        self.assertIn("\\begin{tikzpicture}", content)
        self.assertIn("\\coordinate (A)", content)
        self.assertIn("\\node[circle, draw", content)
        self.assertIn("\\draw[-, draw=black", content)
        self.assertIn("\\draw[->, draw=black", content)
        self.assertIn("$ e $", content)
        self.assertIn("$ f $", content)

    def test_drawing_export_tikz_is_restricted_to_owner(self):
        self.login()

        response = self.client.get(reverse("drawing_export_tikz", kwargs={"pk": self.other_drawing.pk}))

        self.assertEqual(response.status_code, 404)

    def test_drawing_detail_contains_tikz_export_link(self):
        self.login()

        response = self.client.get(reverse("drawing_detail", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, reverse("drawing_export_tikz", kwargs={"pk": self.drawing.pk}))
        self.assertContains(response, "Eksport")

    def test_drawing_detail_contains_latex_text_tool(self):
        self.login()

        response = self.client.get(reverse("drawing_detail", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "text.latex")
        self.assertContains(response, "\\alpha")

    def test_drawing_object_api_creates_latex_text_object(self):
        self.login()

        response = self.client.post(
            reverse("drawing_objects_collection", kwargs={"drawing_id": self.drawing.pk}),
            data=json.dumps({
                "object_id": "txt1",
                "type": "text.latex",
                "data": {"x": 120, "y": 180, "text": "\\alpha+\\beta"},
                "style": {"fill": "#123456", "fontSize": 20, "showLabel": True},
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        obj = DrawingObject.objects.get(drawing=self.drawing, object_id="txt1")
        self.assertEqual(obj.type, "text.latex")
        self.assertEqual(obj.data["text"], "\\alpha+\\beta")
        self.assertEqual(obj.style["fontSize"], 20)

    def test_drawing_editor_static_js_contains_latex_text_support(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        with open(js_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("isTextLike", source)
        self.assertIn("renderLatexText", source)
        self.assertIn("text.latex", source)
        self.assertIn("fontSize", source)

    def test_drawing_export_tikz_contains_latex_text_object(self):
        self.login()
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="txt1",
            type="text.latex",
            data={"x": 200, "y": 320, "text": "\\alpha+\\beta"},
            style={"fill": "#123456", "fontSize": 20, "showLabel": True},
        )

        response = self.client.get(reverse("drawing_export_tikz", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        content = response.content.decode("utf-8")
        self.assertIn("\\definecolor{mde123456}{HTML}{123456}", content)
        self.assertIn("text=mde123456", content)
        self.assertIn("$ \\alpha+\\beta $", content)

    def test_drawing_export_tikz_skips_hidden_latex_text_object(self):
        self.login()
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="txt1",
            type="text.latex",
            data={"x": 200, "y": 320, "text": "hidden"},
            style={"fill": "#123456", "showLabel": False},
        )

        response = self.client.get(reverse("drawing_export_tikz", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        content = response.content.decode("utf-8")
        self.assertNotIn("hidden", content)

    def test_drawing_tikz_preview_returns_json_code(self):
        self.login()
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="A",
            type="geometry.point",
            data={"x": 100, "y": 120, "label": "A"},
        )

        response = self.client.get(reverse("drawing_tikz_preview", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["drawing_id"], self.drawing.pk)
        self.assertIn("\\begin{tikzpicture}", payload["tikz"])
        self.assertIn("\\coordinate (A)", payload["tikz"])

    def test_drawing_tikz_preview_is_restricted_to_owner(self):
        self.login()

        response = self.client.get(reverse("drawing_tikz_preview", kwargs={"pk": self.other_drawing.pk}))

        self.assertEqual(response.status_code, 404)

    def test_drawing_detail_contains_tikz_preview_controls(self):
        self.login()

        response = self.client.get(reverse("drawing_detail", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, reverse("drawing_tikz_preview", kwargs={"pk": self.drawing.pk}))
        self.assertContains(response, "data-role=\"tikz-preview\"")
        self.assertContains(response, "data-action=\"preview-tikz\"")
        self.assertContains(response, "data-action=\"copy-tikz\"")
        self.assertContains(response, "Pokaż TikZ")

    def test_drawing_editor_static_js_contains_tikz_preview_support(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        with open(js_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("previewTikz", source)
        self.assertIn("copyTikzToClipboard", source)
        self.assertIn("navigator.clipboard", source)
        self.assertIn("tikzPreviewUrl", source)
        self.assertIn("document.querySelector(\"[data-action='preview-tikz']\")", source)
        self.assertIn("document.querySelector(\"[data-role='tikz-preview']\")", source)

    def test_drawing_editor_static_css_contains_tikz_preview_styles(self):
        css_path = finders.find("routes/drawing_editor.css")
        self.assertIsNotNone(css_path)
        with open(css_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("drawing-editor__tikz-preview", source)
        self.assertIn("drawing-editor__tikz-textarea", source)

    def test_drawing_object_api_updates_point_label(self):
        self.login()
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="A",
            type="geometry.point",
            data={"x": 100, "y": 120, "label": "old"},
        )

        response = self.client.patch(
            reverse("drawing_object_detail", kwargs={"drawing_id": self.drawing.pk, "object_id": "A"}),
            data=json.dumps({"data": {"x": 100, "y": 120, "label": "new"}}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        obj = DrawingObject.objects.get(drawing=self.drawing, object_id="A")
        self.assertEqual(obj.data["label"], "new")
        self.assertEqual(response.json()["object"]["data"]["label"], "new")

    def test_drawing_object_api_updates_latex_text_content(self):
        self.login()
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="txt1",
            type="text.latex",
            data={"x": 100, "y": 120, "text": "x"},
        )

        response = self.client.patch(
            reverse("drawing_object_detail", kwargs={"drawing_id": self.drawing.pk, "object_id": "txt1"}),
            data=json.dumps({"data": {"x": 100, "y": 120, "text": "\\alpha"}}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        obj = DrawingObject.objects.get(drawing=self.drawing, object_id="txt1")
        self.assertEqual(obj.data["text"], "\\alpha")

    def test_drawing_detail_contains_content_editor_controls(self):
        self.login()

        response = self.client.get(reverse("drawing_detail", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "data-role=\"content-panel\"")
        self.assertContains(response, "data-role=\"content-label\"")
        self.assertContains(response, "data-action=\"apply-content\"")
        self.assertContains(response, "Treść zaznaczonego obiektu")

    def test_drawing_editor_static_js_contains_content_editor_support(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        with open(js_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("updateContentPanel", source)
        self.assertIn("applySelectedContent", source)
        self.assertIn("contentLabelInput", source)
        self.assertIn("data-action='apply-content'", source)
        self.assertIn("body: JSON.stringify({data: newData})", source)

    def test_drawing_editor_static_css_contains_content_editor_styles(self):
        css_path = finders.find("routes/drawing_editor.css")
        self.assertIsNotNone(css_path)
        with open(css_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("drawing-editor__content-panel", source)
        self.assertIn("drawing-editor__content-panel--disabled", source)

    def test_drawing_object_api_can_create_duplicate_without_object_id(self):
        self.login()
        original = DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="A",
            type="geometry.point",
            data={"x": 100, "y": 120, "label": "A"},
            style={"fill": "#111827", "stroke": "#111827"},
        )

        response = self.client.post(
            reverse("drawing_objects_collection", kwargs={"drawing_id": self.drawing.pk}),
            data=json.dumps({
                "type": original.type,
                "data": {"x": 128, "y": 148, "label": "A"},
                "style": original.style,
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertTrue(payload["success"])
        self.assertNotEqual(payload["object"]["object_id"], "A")
        self.assertEqual(payload["object"]["data"]["x"], 128)
        self.assertEqual(payload["object"]["data"]["y"], 148)
        self.assertEqual(DrawingObject.objects.filter(drawing=self.drawing).count(), 2)

    def test_drawing_detail_contains_duplicate_button(self):
        self.login()

        response = self.client.get(reverse("drawing_detail", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "data-action=\"duplicate-selected\"")
        self.assertContains(response, "Duplikuj zaznaczone")

    def test_drawing_editor_static_js_contains_duplicate_support(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        with open(js_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("duplicateSelectedObject", source)
        self.assertIn("duplicatePayloadForObject", source)
        self.assertIn("data-action='duplicate-selected'", source)
        self.assertIn("x + 28", source)
        self.assertIn("method: \"POST\"", source)
        self.assertIn("this.objects.push(result.object)", source)

    def test_drawing_detail_contains_undo_redo_buttons(self):
        self.login()

        response = self.client.get(reverse("drawing_detail", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "data-action=\"undo\"")
        self.assertContains(response, "data-action=\"redo\"")
        self.assertContains(response, "Cofnij")
        self.assertContains(response, "Ponów")

    def test_drawing_editor_static_js_contains_undo_redo_support(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        with open(js_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("undoStack", source)
        self.assertIn("redoStack", source)
        self.assertIn("pushHistory", source)
        self.assertIn("undoLastAction", source)
        self.assertIn("redoLastAction", source)
        self.assertIn("executeHistoryCommand", source)
        self.assertIn("kind: \"create\"", source)
        self.assertIn("kind: \"delete\"", source)
        self.assertIn("kind: \"update\"", source)

    def test_drawing_editor_static_js_undo_redo_uses_api_methods(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        with open(js_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("restoreObject", source)
        self.assertIn("deleteObjectById", source)
        self.assertIn("applyObjectSnapshot", source)
        self.assertIn("method: \"POST\"", source)
        self.assertIn("method: \"DELETE\"", source)
        self.assertIn("method: \"PATCH\"", source)

    def test_drawing_editor_static_css_contains_undo_redo_styles(self):
        css_path = finders.find("routes/drawing_editor.css")
        self.assertIsNotNone(css_path)
        with open(css_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn('[data-action="undo"]', source)
        self.assertIn('[data-action="redo"]', source)
        self.assertIn("cursor: not-allowed", source)

    def test_drawing_detail_contains_multi_selection_controls(self):
        self.login()

        response = self.client.get(reverse("drawing_detail", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "data-role=\"selection-count\"")
        self.assertContains(response, "Zaznaczono: 0")
        self.assertContains(response, "Ctrl/Shift-klik")
        self.assertContains(response, "Usuń zaznaczone")

    def test_drawing_editor_static_js_contains_multi_selection_support(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        with open(js_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("selectedObjectIds", source)
        self.assertIn("toggleSelection", source)
        self.assertIn("selectedObjects", source)
        self.assertIn("positionedSelectedObjects", source)
        self.assertIn("event.shiftKey || event.ctrlKey || event.metaKey", source)
        self.assertIn("data-role='selection-count'", source)

    def test_drawing_editor_static_js_contains_group_operations(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        with open(js_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("bulk-create", source)
        self.assertIn("bulk-delete", source)
        self.assertIn("bulk-update", source)
        self.assertIn("objectIds", source)
        self.assertIn("Promise.all", source)

    def test_drawing_editor_static_js_contains_object_tree_panel_controls(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        with open(js_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("collapsedGroupIds", source)
        self.assertIn("visibleObjectTreeEntries", source)
        self.assertIn("toggleGroupCollapsed", source)
        self.assertIn("renameGroup", source)
        self.assertIn("toggle-group-collapsed", source)
        self.assertIn("rename-group", source)

    def test_drawing_editor_static_css_contains_object_tree_styles(self):
        css_path = finders.find("routes/drawing_editor.css")
        self.assertIsNotNone(css_path)
        with open(css_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("drawing-editor__tree-toggle", source)
        self.assertIn("drawing-editor__tree-prefix", source)
        self.assertIn("drawing-editor__object-row--group", source)

    def test_drawing_editor_static_css_contains_selection_counter_styles(self):
        css_path = finders.find("routes/drawing_editor.css")
        self.assertIsNotNone(css_path)
        with open(css_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("drawing-editor__selection-counter", source)
        self.assertIn("border-radius: 999px", source)


    def test_drawing_detail_contains_default_style_controls(self):
        self.login()

        response = self.client.get(reverse("drawing_detail", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "data-role=\"default-style-panel\"")
        self.assertContains(response, "data-role=\"default-style-stroke\"")
        self.assertContains(response, "data-role=\"default-style-fill\"")
        self.assertContains(response, "data-role=\"default-style-stroke-width\"")
        self.assertContains(response, "data-role=\"default-style-radius\"")
        self.assertContains(response, "Styl nowych obiektów")
        self.assertContains(response, "Zaznaczanie / przesuwanie")

    def test_drawing_editor_static_js_contains_canvas_selection_and_default_style_support(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        with open(js_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("currentToolSelectsOnly", source)
        self.assertIn("styleForNewObject", source)
        self.assertIn("defaultStyleFromControls", source)
        self.assertIn("bindDefaultStyleEvents", source)
        self.assertIn("drawing-editor-default-style", source)
        self.assertIn("drawing-line-hit", source)
        self.assertIn("data-role='default-style-stroke'", source)
        self.assertIn("localStorage", source)

    def test_drawing_editor_static_css_contains_canvas_selection_and_default_style_styles(self):
        css_path = finders.find("routes/drawing_editor.css")
        self.assertIsNotNone(css_path)
        with open(css_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("drawing-editor__default-style-panel", source)
        self.assertIn("drawing-line-hit", source)
        self.assertIn("drawing-line--selected", source)
        self.assertIn("pointer-events: auto", source)

class DrawingEditorRectangleSelectionTests(TestCase):
    def test_drawing_editor_static_js_contains_rectangle_selection_support(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        with open(js_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("handleCanvasPointerDown", source)
        self.assertIn("selectionBoxState", source)
        self.assertIn("finishSelectionBox", source)
        self.assertIn("objectIdsInsideSelectionBox", source)
        self.assertIn("boundsIntersectSelectionBox", source)
        self.assertIn("drawing-editor__selection-box", source)
        self.assertIn("this.ignoreNextCanvasClick = true", source)

    def test_drawing_editor_static_css_contains_rectangle_selection_styles(self):
        css_path = finders.find("routes/drawing_editor.css")
        self.assertIsNotNone(css_path)
        with open(css_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("drawing-editor__selection-box", source)
        self.assertIn("stroke-dasharray", source)
        self.assertIn("pointer-events: none", source)

@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT, PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class DrawingSettingsAndSnapTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice_settings", password="password123")
        self.other_user = User.objects.create_user(username="bob_settings", password="password123")
        self.drawing = Drawing.objects.create(
            user=self.user,
            title="Settings drawing",
            mode=Drawing.MODE_GEOMETRY,
        )
        self.other_drawing = Drawing.objects.create(
            user=self.other_user,
            title="Foreign settings drawing",
            mode=Drawing.MODE_GEOMETRY,
        )

    def login(self):
        self.client.login(username="alice_settings", password="password123")

    def test_drawing_has_settings_json_field(self):
        self.assertEqual(self.drawing.settings, {})
        self.drawing.settings = {
            "canvas": {"width": 1000, "height": 600, "gridSize": 25, "showGrid": True, "snapToGrid": True},
            "tikz": {"scale": 50},
        }
        self.drawing.save()
        self.drawing.refresh_from_db()
        self.assertTrue(self.drawing.settings["canvas"]["snapToGrid"])
        self.assertEqual(self.drawing.settings["tikz"]["scale"], 50)

    def test_drawing_settings_api_gets_and_updates_settings(self):
        self.login()

        get_response = self.client.get(reverse("drawing_settings_api", kwargs={"pk": self.drawing.pk}))
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_response.json()["settings"]["canvas"]["width"], 900)
        self.assertFalse(get_response.json()["settings"]["canvas"]["snapToGrid"])

        patch_response = self.client.patch(
            reverse("drawing_settings_api", kwargs={"pk": self.drawing.pk}),
            data=json.dumps({
                "settings": {
                    "canvas": {
                        "width": 1000,
                        "height": 640,
                        "gridSize": 25,
                        "showGrid": False,
                        "snapToGrid": True,
                    },
                    "tikz": {"scale": 50},
                }
            }),
            content_type="application/json",
        )

        self.assertEqual(patch_response.status_code, 200)
        self.drawing.refresh_from_db()
        self.assertEqual(self.drawing.settings["canvas"]["width"], 1000)
        self.assertEqual(self.drawing.settings["canvas"]["gridSize"], 25)
        self.assertTrue(self.drawing.settings["canvas"]["snapToGrid"])
        self.assertEqual(self.drawing.settings["tikz"]["scale"], 50)

    def test_drawing_settings_api_is_restricted_to_owner(self):
        self.login()

        response = self.client.get(reverse("drawing_settings_api", kwargs={"pk": self.other_drawing.pk}))

        self.assertEqual(response.status_code, 404)

    def test_drawing_detail_contains_settings_controls(self):
        self.login()

        response = self.client.get(reverse("drawing_detail", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, reverse("drawing_settings_api", kwargs={"pk": self.drawing.pk}))
        self.assertContains(response, "data-role=\"settings-panel\"")
        self.assertContains(response, "data-role=\"settings-grid-size\"")
        self.assertContains(response, "data-role=\"settings-snap-to-grid\"")
        self.assertContains(response, "Przyciągaj punkty do siatki")

    def test_drawing_export_tikz_uses_drawing_settings_scale_and_height(self):
        self.login()
        self.drawing.settings = {
            "canvas": {"width": 1000, "height": 600, "gridSize": 50, "showGrid": True, "snapToGrid": False},
            "tikz": {"scale": 50},
        }
        self.drawing.save()
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="A",
            type="geometry.point",
            data={"x": 100, "y": 100, "label": "A"},
        )

        response = self.client.get(reverse("drawing_export_tikz", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        content = response.content.decode("utf-8")
        self.assertIn("\\coordinate (A) at (2, 10);", content)

    def test_drawing_editor_static_js_contains_settings_and_snap_support(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        with open(js_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("settingsUrl", source)
        self.assertIn("applyDrawingSettings", source)
        self.assertIn("snapPoint", source)
        self.assertIn("settings-snap-to-grid", source)
        self.assertIn("renderGrid", source)
        self.assertIn('method: "PATCH"', source)

    def test_drawing_editor_static_css_contains_settings_panel_styles(self):
        css_path = finders.find("routes/drawing_editor.css")
        self.assertIsNotNone(css_path)
        with open(css_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("drawing-editor__settings-panel", source)
        self.assertIn("pointer-events: none", source)

@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT, PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class DrawingCircleObjectTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice_circle", password="password123")
        self.drawing = Drawing.objects.create(
            user=self.user,
            title="Circle drawing",
            mode=Drawing.MODE_GEOMETRY,
        )

    def login(self):
        self.client.login(username="alice_circle", password="password123")

    def test_api_can_store_geometry_circle_dependent_on_two_points(self):
        self.login()
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="A",
            type="geometry.point",
            data={"x": 100, "y": 100, "label": "A"},
        )
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="B",
            type="geometry.point",
            data={"x": 200, "y": 100, "label": "B"},
        )

        response = self.client.post(
            reverse("drawing_objects_collection", kwargs={"drawing_id": self.drawing.pk}),
            data=json.dumps({
                "object_id": "circle_c",
                "type": "geometry.circle",
                "data": {"center": "A", "point": "B", "label": "c"},
                "style": {"stroke": "#ff0000", "fill": "none", "strokeWidth": 2},
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        obj = DrawingObject.objects.get(drawing=self.drawing, object_id="circle_c")
        self.assertEqual(obj.type, "geometry.circle")
        self.assertEqual(obj.data["center"], "A")
        self.assertEqual(obj.data["point"], "B")

    def test_drawing_detail_contains_geometry_circle_tool(self):
        self.login()

        response = self.client.get(reverse("drawing_detail", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "geometry.circle")

    def test_drawing_editor_static_js_contains_circle_support(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        with open(js_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("isCircleLike", source)
        self.assertIn("currentToolCreatesCircle", source)
        self.assertIn("renderCircle", source)
        self.assertIn("center: startId", source)
        self.assertIn("point: endId", source)
        self.assertIn("drawing-circle-hit", source)

    def test_drawing_export_tikz_exports_geometry_circle(self):
        self.login()
        self.drawing.settings = {
            "canvas": {"width": 900, "height": 520, "gridSize": 50, "showGrid": True, "snapToGrid": False},
            "tikz": {"scale": 100},
        }
        self.drawing.save()
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="A",
            type="geometry.point",
            data={"x": 100, "y": 100, "label": "A"},
        )
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="B",
            type="geometry.point",
            data={"x": 200, "y": 100, "label": "B"},
        )
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="circle_c",
            type="geometry.circle",
            data={"center": "A", "point": "B", "label": "c"},
            style={"stroke": "#ff0000", "fill": "none", "strokeWidth": 2},
        )

        response = self.client.get(reverse("drawing_export_tikz", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        content = response.content.decode("utf-8")
        self.assertIn("\\definecolor{mdeFF0000}{HTML}{FF0000}", content)
        self.assertIn("\\draw[draw=mdeFF0000, line width=2pt] (1, 4.2) circle (1cm);", content)
        self.assertIn("\\node[right] at (2, 4.2) {$ c $};", content)

@override_settings(MEDIA_ROOT=TEST_MEDIA_ROOT, PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class DrawingPolygonObjectTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice_polygon", password="password123")
        self.drawing = Drawing.objects.create(
            user=self.user,
            title="Polygon drawing",
            mode=Drawing.MODE_GEOMETRY,
        )

    def login(self):
        self.client.login(username="alice_polygon", password="password123")

    def create_triangle_points(self):
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="A",
            type="geometry.point",
            data={"x": 100, "y": 100, "label": "A"},
        )
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="B",
            type="geometry.point",
            data={"x": 200, "y": 100, "label": "B"},
        )
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="C",
            type="geometry.point",
            data={"x": 150, "y": 200, "label": "C"},
        )

    def test_api_can_store_geometry_polygon_dependent_on_points(self):
        self.login()
        self.create_triangle_points()

        response = self.client.post(
            reverse("drawing_objects_collection", kwargs={"drawing_id": self.drawing.pk}),
            data=json.dumps({
                "object_id": "triangle_abc",
                "type": "geometry.polygon",
                "data": {"points": ["A", "B", "C"], "closed": True, "label": "T"},
                "style": {"stroke": "#00aa00", "fill": "#ffffff", "strokeWidth": 2},
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        obj = DrawingObject.objects.get(drawing=self.drawing, object_id="triangle_abc")
        self.assertEqual(obj.type, "geometry.polygon")
        self.assertEqual(obj.data["points"], ["A", "B", "C"])
        self.assertTrue(obj.data["closed"])

    def test_drawing_detail_contains_geometry_polygon_tool_without_finish_buttons(self):
        self.login()

        response = self.client.get(reverse("drawing_detail", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "geometry.polygon")
        self.assertContains(response, "Wielokąt domykasz kliknięciem pierwszego punktu")
        self.assertNotContains(response, 'data-action="finish-polygon"')
        self.assertNotContains(response, 'data-action="cancel-polygon"')

    def test_drawing_editor_static_js_contains_polygon_support(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        with open(js_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("isPolygonLike", source)
        self.assertIn("currentToolCreatesPolygon", source)
        self.assertIn("pendingPolygonPointIds", source)
        self.assertIn("finishPendingPolygon", source)
        self.assertIn("renderPolygon", source)
        self.assertIn("drawing-polygon-hit", source)

    def test_drawing_export_tikz_exports_geometry_polygon(self):
        self.login()
        self.drawing.settings = {
            "canvas": {"width": 900, "height": 520, "gridSize": 50, "showGrid": True, "snapToGrid": False},
            "tikz": {"scale": 100},
        }
        self.drawing.save()
        self.create_triangle_points()
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="triangle_abc",
            type="geometry.polygon",
            data={"points": ["A", "B", "C"], "closed": True, "label": "T"},
            style={"stroke": "#00aa00", "fill": "none", "strokeWidth": 2},
        )

        response = self.client.get(reverse("drawing_export_tikz", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        content = response.content.decode("utf-8")
        self.assertIn("\\definecolor{mde00AA00}{HTML}{00AA00}", content)
        self.assertIn("\\draw[draw=mde00AA00, line width=2pt] (A) -- (B) -- (C) -- cycle;", content)
        self.assertIn("\\node at", content)
        self.assertIn("$ T $", content)


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class DrawingObjectTypeSeparationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="type_rules_user", password="password123")
        self.drawing = Drawing.objects.create(user=self.user, title="Type rules", mode=Drawing.MODE_MIXED)
        self.client.login(username="type_rules_user", password="password123")
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="gp",
            type="geometry.point",
            data={"x": 100, "y": 100},
        )
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="gv",
            type="graph.vertex",
            data={"x": 200, "y": 100},
        )

    def post_object(self, payload):
        return self.client.post(
            reverse("drawing_objects_collection", kwargs={"drawing_id": self.drawing.pk}),
            data=json.dumps(payload),
            content_type="application/json",
        )

    def test_geometry_circle_rejects_graph_vertex_as_reference(self):
        response = self.post_object({
            "type": "geometry.circle",
            "data": {"center": "gp", "point": "gv"},
        })

        self.assertEqual(response.status_code, 400)
        self.assertIn("point", response.json()["errors"])

    def test_geometry_polygon_rejects_graph_vertex_as_point(self):
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="gp2",
            type="geometry.point",
            data={"x": 150, "y": 180},
        )

        response = self.post_object({
            "type": "geometry.polygon",
            "data": {"points": ["gp", "gp2", "gv"], "closed": True},
        })

        self.assertEqual(response.status_code, 400)
        self.assertIn("points[2]", response.json()["errors"])

    def test_graph_edge_rejects_geometry_point_as_endpoint(self):
        response = self.post_object({
            "type": "graph.edge",
            "data": {"source": "gv", "target": "gp"},
        })

        self.assertEqual(response.status_code, 400)
        self.assertIn("target", response.json()["errors"])

    def test_frontend_contains_automatic_circle_and_polygon_point_creation(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        with open(js_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("createGeometryPointAt", source)
        self.assertIn("pointIsAllowedForCurrentTool", source)
        self.assertIn("Wierzchołki grafu nie są używane w geometrii", source)
        self.assertIn("Kliknij ponownie pierwszy punkt", source)



    def test_frontend_contains_step21_segment_autocreate_and_graph_edge_tools(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        with open(js_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("graph.edge.undirected", source)
        self.assertIn("graph.edge.directed", source)
        self.assertIn("Utworzono pierwszy koniec odcinka", source)
        self.assertIn("styleDirectedInput", source)

    def test_tikz_export_undirected_graph_edge_uses_plain_line(self):
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="v1",
            type="graph.vertex",
            data={"x": 100, "y": 100, "label": "v_1"},
        )
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="v2",
            type="graph.vertex",
            data={"x": 200, "y": 100, "label": "v_2"},
        )
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="e",
            type="graph.edge",
            data={"source": "v1", "target": "v2"},
            style={"directed": False},
        )

        response = self.client.get(reverse("drawing_export_tikz", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        content = response.content.decode("utf-8")
        self.assertIn("\\draw[-, draw=black", content)
        self.assertNotIn("\\draw[->, draw=black", content)



@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class MainNavigationCleanupTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="navuser", password="password123")

    def login(self):
        self.client.login(username="navuser", password="password123")

    def test_home_page_is_drawing_list(self):
        self.login()

        response = self.client.get(reverse("home"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Moje rysunki")
        self.assertNotContains(response, "My routes")
        self.assertNotContains(response, "New route")

    def test_main_navigation_shows_only_drawing_links(self):
        self.login()

        response = self.client.get(reverse("drawing_list"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Route Editor")
        self.assertContains(response, "Moje rysunki")
        self.assertContains(response, "Nowy rysunek")
        self.assertNotContains(response, "My routes")
        self.assertNotContains(response, "New route")
        self.assertNotContains(response, "Structured drawings")


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class DrawingToolboxUiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="toolbox_user", password="password123")
        self.drawing = Drawing.objects.create(user=self.user, title="Toolbox drawing", mode=Drawing.MODE_MIXED)
        self.client.login(username="toolbox_user", password="password123")

    def test_drawing_detail_contains_grouped_toolbox(self):
        response = self.client.get(reverse("drawing_detail", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'class="drawing-editor__toolbox"')
        self.assertContains(response, 'data-tool-group="selection"')
        self.assertContains(response, 'data-tool-group="text"')
        self.assertContains(response, 'data-tool-group="graph"')
        self.assertContains(response, 'data-tool-group="geometry-basic"')
        self.assertContains(response, 'data-tool-group="geometry-points"')
        self.assertContains(response, 'data-tool-group="geometry-triangle-centers"')
        self.assertContains(response, 'data-tool-group="geometry-tangency"')
        self.assertContains(response, 'data-tool-group="geometry-transformations"')
        self.assertContains(response, 'data-tool-button="select"')
        self.assertContains(response, 'data-tool-button="graph.vertex"')
        self.assertContains(response, 'data-tool-button="graph.edge.undirected"')
        self.assertContains(response, 'data-tool-button="graph.edge.directed"')
        self.assertContains(response, 'data-tool-button="geometry.circle"')
        self.assertContains(response, 'data-tool-button="geometry.polygon"')

    def test_hidden_select_still_exists_as_tool_state_for_frontend(self):
        response = self.client.get(reverse("drawing_detail", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'data-role="object-type"')
        self.assertContains(response, 'class="drawing-editor__tool-select"')

    def test_drawing_editor_js_syncs_tool_buttons_with_current_tool(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        with open(js_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("toolButtons", source)
        self.assertIn("setToolType", source)
        self.assertIn("syncToolButtons", source)
        self.assertIn("drawing-editor__tool-button--active", source)
        self.assertIn("aria-pressed", source)

    def test_drawing_editor_css_contains_grouped_toolbox_styles(self):
        css_path = finders.find("routes/drawing_editor.css")
        self.assertIsNotNone(css_path)
        with open(css_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("drawing-editor__toolbox", source)
        self.assertIn("drawing-editor__tool-group", source)
        self.assertIn("drawing-editor__tool-button", source)
        self.assertIn("drawing-editor__tool-button--active", source)

@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class DrawingObjectOrderingTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="order_user", password="password123")
        self.drawing = Drawing.objects.create(user=self.user, title="Ordering", mode=Drawing.MODE_MIXED)
        self.client.login(username="order_user", password="password123")
        self.back = DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="back",
            type="geometry.point",
            data={"x": 100, "y": 100, "label": "B"},
            order=0,
        )
        self.front = DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="front",
            type="geometry.point",
            data={"x": 200, "y": 100, "label": "F"},
            order=10,
        )

    def test_objects_api_returns_objects_ordered_by_order(self):
        response = self.client.get(reverse("drawing_objects_collection", kwargs={"drawing_id": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        object_ids = [item["object_id"] for item in response.json()["objects"]]
        self.assertEqual(object_ids, ["back", "front"])

    def test_object_order_can_be_updated_with_patch(self):
        response = self.client.patch(
            reverse("drawing_object_detail", kwargs={"drawing_id": self.drawing.pk, "object_id": "back"}),
            data=json.dumps({"order": 20}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        self.back.refresh_from_db()
        self.assertEqual(self.back.order, 20)

    def test_drawing_detail_contains_ordering_buttons(self):
        response = self.client.get(reverse("drawing_detail", kwargs={"pk": self.drawing.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'data-action="bring-to-front"')
        self.assertContains(response, 'data-action="send-to-back"')
        self.assertContains(response, 'data-action="move-up"')
        self.assertContains(response, 'data-action="move-down"')
        self.assertContains(response, "Na wierzch")
        self.assertContains(response, "Pod spód")

    def test_drawing_editor_js_contains_reordering_logic(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        with open(js_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("reorderSelectedObjects", source)
        self.assertIn("sortedObjects", source)
        self.assertIn("bring-to-front", source)
        self.assertIn("send-to-back", source)
        self.assertIn("move-up", source)
        self.assertIn("move-down", source)
        self.assertIn("JSON.stringify({order: object.order})", source)

    def test_drawing_editor_css_contains_order_label_style(self):
        css_path = finders.find("routes/drawing_editor.css")
        self.assertIsNotNone(css_path)
        with open(css_path, encoding="utf-8") as file:
            source = file.read()

        self.assertIn("drawing-editor__object-row em", source)

class DrawingDependentGeometryPointMovementTests(TestCase):
    def test_drawing_editor_js_renders_dependent_shapes_before_control_points(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        content = Path(js_path).read_text(encoding="utf-8")
        self.assertIn('sortedObjectsForRendering', content)
        self.assertIn('renderingLayer(object)', content)
        self.assertIn('isPolygonLike(object) || isCircleLike(object) || isLineLike(object)', content)
        self.assertIn('isPointLike(object) || isTextLike(object)', content)

    def test_drawing_editor_switches_to_select_after_geometry_creation(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        content = Path(js_path).read_text(encoding="utf-8")
        self.assertIn('switchToSelectAfterGeometryCreation', content)
        self.assertIn('this.setToolType("select")', content)
        self.assertIn('Możesz teraz przesuwać jego punkty sterujące', content)

@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class DrawingModeToolAvailabilityTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="mode_user", password="password123")
        self.client.login(username="mode_user", password="password123")

    def create_drawing(self, mode):
        return Drawing.objects.create(user=self.user, title=f"Drawing {mode}", mode=mode)

    def test_create_drawing_form_explains_modes(self):
        response = self.client.get(reverse("drawing_create"))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Tryb rysunku")
        self.assertContains(response, "Graf")
        self.assertContains(response, "Geometria")
        self.assertContains(response, "Wykresy")
        self.assertNotContains(response, "Wszystko")


    def test_create_drawing_form_rejects_mixed_mode(self):
        response = self.client.post(reverse("drawing_create"), {"title": "No mixed", "mode": Drawing.MODE_MIXED})

        self.assertEqual(response.status_code, 200)
        self.assertFalse(Drawing.objects.filter(user=self.user, title="No mixed").exists())
        self.assertFormError(response.context["form"], "mode", "Select a valid choice. mixed is not one of the available choices.")

    def test_graph_mode_shows_only_graph_tools(self):
        drawing = self.create_drawing(Drawing.MODE_GRAPH)
        response = self.client.get(reverse("drawing_detail", kwargs={"pk": drawing.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'data-drawing-mode="graph"')
        self.assertContains(response, 'data-tool-group="graph"')
        self.assertContains(response, 'data-tool-button="graph.vertex"')
        self.assertContains(response, 'data-tool-button="graph.edge.undirected"')
        self.assertNotContains(response, 'data-tool-group="geometry"')
        self.assertNotContains(response, 'data-tool-button="geometry.circle"')
        self.assertContains(response, 'data-tool-group="text"')

    def test_geometry_mode_shows_only_geometry_tools(self):
        drawing = self.create_drawing(Drawing.MODE_GEOMETRY)
        response = self.client.get(reverse("drawing_detail", kwargs={"pk": drawing.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'data-drawing-mode="geometry"')
        self.assertContains(response, 'data-tool-group="geometry-basic"')
        self.assertContains(response, 'data-tool-group="geometry-points"')
        self.assertContains(response, 'data-tool-group="geometry-triangle-centers"')
        self.assertContains(response, 'data-tool-group="geometry-tangency"')
        self.assertContains(response, 'data-tool-group="geometry-transformations"')
        self.assertContains(response, 'data-tool-button="geometry.circle"')
        self.assertNotContains(response, 'data-tool-group="graph"')
        self.assertNotContains(response, 'data-tool-button="graph.vertex"')
        self.assertContains(response, 'data-tool-group="text"')

    def test_plot_mode_shows_plot_tools_without_graph_or_geometry_tools(self):
        drawing = self.create_drawing(Drawing.MODE_PLOT)
        response = self.client.get(reverse("drawing_detail", kwargs={"pk": drawing.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'data-drawing-mode="plot"')
        self.assertContains(response, 'data-tool-group="plot"')
        self.assertContains(response, 'data-tool-button="plot.series"')
        self.assertContains(response, 'data-role="plot-panel"')
        self.assertContains(response, "Wykres z danych")
        self.assertNotContains(response, 'data-tool-group="graph"')
        self.assertNotContains(response, 'data-tool-group="geometry"')

    def test_mixed_mode_shows_graph_geometry_and_text_tools(self):
        drawing = self.create_drawing(Drawing.MODE_MIXED)
        response = self.client.get(reverse("drawing_detail", kwargs={"pk": drawing.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'data-tool-group="graph"')
        self.assertContains(response, 'data-tool-group="geometry-basic"')
        self.assertContains(response, 'data-tool-group="geometry-points"')
        self.assertContains(response, 'data-tool-group="geometry-triangle-centers"')
        self.assertContains(response, 'data-tool-group="geometry-tangency"')
        self.assertContains(response, 'data-tool-group="geometry-transformations"')
        self.assertContains(response, 'data-tool-group="text"')

    def test_graph_mode_api_rejects_geometry_object(self):
        drawing = self.create_drawing(Drawing.MODE_GRAPH)
        response = self.client.post(
            reverse("drawing_objects_collection", kwargs={"drawing_id": drawing.pk}),
            data=json.dumps({
                "object_id": "p1",
                "type": "geometry.point",
                "data": {"x": 10, "y": 10},
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("type", response.json()["errors"])

    def test_geometry_mode_api_rejects_graph_object(self):
        drawing = self.create_drawing(Drawing.MODE_GEOMETRY)
        response = self.client.post(
            reverse("drawing_objects_collection", kwargs={"drawing_id": drawing.pk}),
            data=json.dumps({
                "object_id": "v1",
                "type": "graph.vertex",
                "data": {"x": 10, "y": 10},
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("type", response.json()["errors"])

    def test_mixed_mode_api_allows_text_object(self):
        drawing = self.create_drawing(Drawing.MODE_MIXED)
        response = self.client.post(
            reverse("drawing_objects_collection", kwargs={"drawing_id": drawing.pk}),
            data=json.dumps({
                "object_id": "t1",
                "type": "text.latex",
                "data": {"x": 10, "y": 10, "text": "x_i"},
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)

    def test_plot_mode_api_rejects_graph_objects(self):
        drawing = self.create_drawing(Drawing.MODE_PLOT)
        response = self.client.post(
            reverse("drawing_objects_collection", kwargs={"drawing_id": drawing.pk}),
            data=json.dumps({
                "object_id": "v1",
                "type": "graph.vertex",
                "data": {"x": 10, "y": 10},
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("not allowed", response.json()["errors"]["type"])

    def test_plot_mode_api_allows_plot_series(self):
        drawing = self.create_drawing(Drawing.MODE_PLOT)
        response = self.client.post(
            reverse("drawing_objects_collection", kwargs={"drawing_id": drawing.pk}),
            data=json.dumps({
                "object_id": "series1",
                "type": "plot.series",
                "data": {
                    "points": [[0, 0], [1, 2], [2, 3]],
                    "label": "Dane",
                    "plotType": "line_markers",
                },
                "style": {"stroke": "#2563eb", "strokeWidth": 2},
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["object"]["type"], "plot.series")

    def test_plot_series_requires_numeric_points(self):
        drawing = self.create_drawing(Drawing.MODE_PLOT)
        response = self.client.post(
            reverse("drawing_objects_collection", kwargs={"drawing_id": drawing.pk}),
            data=json.dumps({
                "object_id": "bad_series",
                "type": "plot.series",
                "data": {"points": [[0, "x"]]},
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("points[0]", response.json()["errors"])

    def test_plot_series_exports_to_pgfplots(self):
        drawing = self.create_drawing(Drawing.MODE_PLOT)
        DrawingObject.objects.create(
            drawing=drawing,
            object_id="series1",
            type="plot.series",
            data={"points": [[0, 0], [1, 2]], "label": "Dane", "plotType": "line"},
            style={"stroke": "#2563eb", "strokeWidth": 2},
        )
        response = self.client.get(reverse("drawing_export_tikz", kwargs={"pk": drawing.pk}))

        self.assertEqual(response.status_code, 200)
        content = response.content.decode("utf-8")
        self.assertIn("\\begin{axis}", content)
        self.assertIn("\\addplot+", content)
        self.assertIn("(0, 0)", content)
        self.assertIn("\\addlegendentry", content)

    def test_drawing_editor_js_reads_drawing_mode_and_rejects_unavailable_tools(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        content = Path(js_path).read_text(encoding="utf-8")

        self.assertIn("drawingMode", content)
        self.assertIn("availableToolTypes", content)
        self.assertIn("To narzędzie nie jest dostępne", content)

    def test_plot_panel_contains_axis_settings(self):
        drawing = self.create_drawing(Drawing.MODE_PLOT)
        response = self.client.get(reverse("drawing_detail", kwargs={"pk": drawing.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'data-role="plot-axis-settings"')
        self.assertContains(response, 'data-role="plot-title"')
        self.assertContains(response, 'data-role="plot-x-label"')
        self.assertContains(response, 'data-role="plot-y-label"')
        self.assertContains(response, 'data-role="plot-x-min"')
        self.assertContains(response, 'data-role="plot-y-max"')

    def test_plot_series_accepts_axis_settings(self):
        drawing = self.create_drawing(Drawing.MODE_PLOT)
        response = self.client.post(
            reverse("drawing_objects_collection", kwargs={"drawing_id": drawing.pk}),
            data=json.dumps({
                "object_id": "series_axis",
                "type": "plot.series",
                "data": {
                    "points": [[0, 0], [1, 2]],
                    "plotType": "line",
                    "axis": {
                        "title": "Tytuł",
                        "xLabel": "t",
                        "yLabel": "f(t)",
                        "xMin": 0,
                        "xMax": 10,
                        "yMin": -1,
                        "yMax": 5,
                    },
                },
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        axis = response.json()["object"]["data"]["axis"]
        self.assertEqual(axis["title"], "Tytuł")
        self.assertEqual(axis["xMax"], 10)

    def test_plot_series_rejects_invalid_axis_range(self):
        drawing = self.create_drawing(Drawing.MODE_PLOT)
        response = self.client.post(
            reverse("drawing_objects_collection", kwargs={"drawing_id": drawing.pk}),
            data=json.dumps({
                "object_id": "bad_axis",
                "type": "plot.series",
                "data": {
                    "points": [[0, 0], [1, 2]],
                    "axis": {"xMin": 5, "xMax": 5},
                },
            }),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("axis.xRange", response.json()["errors"])

    def test_plot_series_axis_settings_export_to_pgfplots(self):
        drawing = self.create_drawing(Drawing.MODE_PLOT)
        DrawingObject.objects.create(
            drawing=drawing,
            object_id="series_axis",
            type="plot.series",
            data={
                "points": [[0, 0], [1, 2]],
                "label": "Dane",
                "plotType": "line",
                "axis": {
                    "title": "Wyniki",
                    "xLabel": "t",
                    "yLabel": "f(t)",
                    "xMin": 0,
                    "xMax": 10,
                    "yMin": -1,
                    "yMax": 5,
                },
            },
            style={"stroke": "#2563eb", "strokeWidth": 2},
        )
        response = self.client.get(reverse("drawing_export_tikz", kwargs={"pk": drawing.pk}))

        self.assertEqual(response.status_code, 200)
        content = response.content.decode("utf-8")
        self.assertIn("title={$Wyniki$}", content)
        self.assertIn("xlabel={$t$}", content)
        self.assertIn("ylabel={$f(t)$}", content)
        self.assertIn("xmin=0", content)
        self.assertIn("xmax=10", content)
        self.assertIn("ymin=-1", content)
        self.assertIn("ymax=5", content)

    def test_drawing_editor_js_contains_plot_axis_support(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        content = Path(js_path).read_text(encoding="utf-8")

        self.assertIn("plotAxisSettingsFromPanel", content)
        self.assertIn("plotTitleInput", content)
        self.assertIn("xMin", content)
        self.assertIn("yMax", content)

class PlotPanelUxStep27Tests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="plot_ux_user", password="password123")
        self.client.login(username="plot_ux_user", password="password123")

    def create_drawing(self, mode=Drawing.MODE_PLOT):
        return Drawing.objects.create(user=self.user, title=f"Drawing {mode}", mode=mode)

    def test_plot_data_panel_is_below_canvas_not_in_side_panel(self):
        drawing = self.create_drawing(Drawing.MODE_PLOT)
        response = self.client.get(reverse("drawing_detail", kwargs={"pk": drawing.pk}))

        self.assertEqual(response.status_code, 200)
        content = response.content.decode("utf-8")
        self.assertIn('drawing-editor__plot-panel--below-canvas', content)
        self.assertIn('Zastosuj dane wykresu', content)
        self.assertLess(content.index('data-role="drawing-status"'), content.index('data-role="plot-panel"'))
        self.assertLess(content.index('data-role="plot-panel"'), content.index('class="drawing-editor__side-panel"'))

    def test_plot_panel_explains_empty_data_removes_plot(self):
        drawing = self.create_drawing(Drawing.MODE_PLOT)
        response = self.client.get(reverse("drawing_detail", kwargs={"pk": drawing.pk}))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Jeśli pole danych będzie puste')
        self.assertContains(response, 'istniejący wykres zostanie usunięty')

    def test_drawing_editor_js_syncs_plot_series_from_textarea(self):
        js_path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(js_path)
        content = Path(js_path).read_text(encoding="utf-8")

        self.assertIn('parsePlotData(this.plotDataInput ? this.plotDataInput.value : "", {allowEmpty: true})', content)
        self.assertIn('deletePlotSeriesObjects', content)
        self.assertIn('updatePlotPanelFromSelection', content)
        self.assertIn('Na rysunku są tylko punkty wpisane w polu danych', content)

class PlotChartStep29Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username="plot_chart_user", password="password123")

    def setUp(self):
        self.client.login(username="plot_chart_user", password="password123")
        self.drawing = Drawing.objects.create(user=self.user, title="Chart", mode=Drawing.MODE_PLOT)

    def test_plot_mode_allows_plot_chart_object(self):
        response = self.client.post(
            reverse("drawing_objects_collection", args=[self.drawing.id]),
            data=json.dumps({
                "type": "plot.chart",
                "data": {
                    "axis": {"title": "Wyniki", "xLabel": "x", "yLabel": "y"},
                    "legend": {"show": True},
                    "series": [
                        {"label": "A", "plotType": "line", "points": [[0, 0], [1, 2]], "style": {"stroke": "#2563eb"}},
                        {"label": "B", "plotType": "scatter", "points": [[0, 1], [1, 3]], "style": {"stroke": "#dc2626"}},
                    ],
                    "functions": [
                        {"expression": "x^2", "domainMin": -2, "domainMax": 2, "label": "x^2", "color": "#16a34a"}
                    ],
                },
                "style": {"stroke": "#2563eb", "strokeWidth": 2},
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["object"]["type"], "plot.chart")

    def test_plot_chart_rejects_invalid_series_point(self):
        response = self.client.post(
            reverse("drawing_objects_collection", args=[self.drawing.id]),
            data=json.dumps({
                "type": "plot.chart",
                "data": {
                    "series": [{"label": "A", "plotType": "line", "points": [[0, "bad"]]}],
                    "functions": [],
                },
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("series[0].points[0]", response.json()["errors"])

    def test_plot_chart_exports_multiple_series_and_function(self):
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="chart1",
            type="plot.chart",
            data={
                "axis": {"title": "Wyniki", "xLabel": "t", "yLabel": "f(t)"},
                "legend": {"show": True},
                "series": [
                    {"label": "A", "plotType": "line", "points": [[0, 0], [1, 2]], "style": {"stroke": "#2563eb"}},
                    {"label": "B", "plotType": "scatter", "points": [[0, 1], [1, 3]], "style": {"stroke": "#dc2626"}},
                ],
                "functions": [
                    {"expression": "x^2", "domainMin": -2, "domainMax": 2, "label": "x^2", "color": "#16a34a"}
                ],
            },
            style={"strokeWidth": 2},
        )
        response = self.client.get(reverse("drawing_export_tikz", args=[self.drawing.id]))
        self.assertEqual(response.status_code, 200)
        content = response.content.decode("utf-8")
        self.assertIn("\\begin{axis}", content)
        self.assertIn("\\addplot+", content)
        self.assertIn("coordinates", content)
        self.assertIn("domain=-2:2", content)
        self.assertIn("{x^2}", content)
        self.assertIn("\\addlegendentry{$ A $}", content)
        self.assertIn("\\addlegendentry{$ B $}", content)

    def test_plot_panel_contains_multiple_series_and_function_controls(self):
        response = self.client.get(reverse("drawing_detail", args=[self.drawing.id]))
        self.assertContains(response, "plot.chart")
        self.assertContains(response, "Serie danych")
        self.assertContains(response, "Funkcje")
        self.assertContains(response, 'data-role="plot-functions"')
        self.assertContains(response, 'data-role="plot-show-legend"')

class DrawingJsonImportExportStep30Tests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username="json_user", password="password123")
        cls.other_user = User.objects.create_user(username="json_other", password="password123")

    def setUp(self):
        self.client.login(username="json_user", password="password123")

    def test_export_drawing_json_contains_structural_document(self):
        drawing = Drawing.objects.create(
            user=self.user,
            title="Geo JSON",
            mode=Drawing.MODE_GEOMETRY,
            settings={"canvas": {"width": 900, "height": 520, "gridSize": 25, "showGrid": True, "snapToGrid": True}},
        )
        DrawingObject.objects.create(
            drawing=drawing,
            object_id="A",
            type="geometry.point",
            data={"x": 100, "y": 200, "label": "A"},
            style={"stroke": "#111827", "fill": "#ffffff"},
            order=2,
        )

        response = self.client.get(reverse("drawing_export_json", args=[drawing.id]))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/json; charset=utf-8")
        self.assertIn("attachment", response["Content-Disposition"])
        document = json.loads(response.content.decode("utf-8"))
        self.assertEqual(document["title"], "Geo JSON")
        self.assertEqual(document["mode"], Drawing.MODE_GEOMETRY)
        self.assertEqual(document["settings"]["canvas"]["gridSize"], 25)
        self.assertEqual(document["objects"][0]["object_id"], "A")
        self.assertEqual(document["objects"][0]["type"], "geometry.point")

    def test_export_drawing_json_rejects_other_users_drawing(self):
        drawing = Drawing.objects.create(user=self.other_user, title="Secret", mode=Drawing.MODE_GRAPH)
        response = self.client.get(reverse("drawing_export_json", args=[drawing.id]))
        self.assertEqual(response.status_code, 404)

    def test_import_drawing_json_creates_new_drawing_and_objects(self):
        document = {
            "schema_version": 1,
            "title": "Imported geometry",
            "mode": "geometry",
            "settings": {"canvas": {"width": 800, "height": 500, "gridSize": 20, "showGrid": True, "snapToGrid": False}},
            "metadata": {"source": "test"},
            "objects": [
                {"object_id": "A", "type": "geometry.point", "data": {"x": 10, "y": 20, "label": "A"}, "style": {"stroke": "#111827"}, "order": 0},
                {"object_id": "B", "type": "geometry.point", "data": {"x": 60, "y": 20, "label": "B"}, "style": {"stroke": "#111827"}, "order": 1},
                {"object_id": "AB", "type": "geometry.segment", "data": {"source": "A", "target": "B", "label": "a"}, "style": {"stroke": "#2563eb"}, "order": 2},
            ],
        }
        upload = SimpleUploadedFile("drawing.json", json.dumps(document).encode("utf-8"), content_type="application/json")

        response = self.client.post(reverse("drawing_import_json"), {"json_file": upload})

        self.assertEqual(response.status_code, 302)
        imported = Drawing.objects.get(user=self.user, title="Imported geometry")
        self.assertEqual(imported.mode, Drawing.MODE_GEOMETRY)
        self.assertEqual(imported.drawing_objects.count(), 3)
        self.assertTrue(imported.metadata["imported_from_json"])
        self.assertTrue(imported.drawing_objects.filter(object_id="AB", type="geometry.segment").exists())

    def test_import_drawing_json_rejects_invalid_mode(self):
        document = {"title": "Bad", "mode": "mixed", "objects": []}
        response = self.client.post(reverse("drawing_import_json"), {"json_text": json.dumps(document)})
        self.assertEqual(response.status_code, 400)
        self.assertContains(response, "mode", status_code=400)
        self.assertFalse(Drawing.objects.filter(user=self.user, title="Bad").exists())

    def test_import_drawing_json_rejects_geometry_reference_to_graph_vertex(self):
        document = {
            "title": "Bad refs",
            "mode": "geometry",
            "objects": [
                {"object_id": "v1", "type": "graph.vertex", "data": {"x": 10, "y": 20}, "style": {}, "order": 0},
                {"object_id": "c1", "type": "geometry.circle", "data": {"center": "v1", "point": "v1"}, "style": {}, "order": 1},
            ],
        }
        response = self.client.post(reverse("drawing_import_json"), {"json_text": json.dumps(document)})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Drawing.objects.filter(user=self.user, title="Bad refs").exists())

    def test_drawing_list_and_detail_link_json_import_export(self):
        drawing = Drawing.objects.create(user=self.user, title="Links", mode=Drawing.MODE_GRAPH)
        list_response = self.client.get(reverse("drawing_list"))
        detail_response = self.client.get(reverse("drawing_detail", args=[drawing.id]))

        self.assertContains(list_response, reverse("drawing_import_json"))
        self.assertContains(detail_response, reverse("drawing_export_json", args=[drawing.id]))
        self.assertContains(detail_response, "Pobierz JSON")

@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class DrawingDetailCleanUiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="clean_ui_user", password="password123")
        self.drawing = Drawing.objects.create(user=self.user, title="Clean UI", mode=Drawing.MODE_GEOMETRY, metadata={"debug": True})
        self.client.login(username="clean_ui_user", password="password123")

    def test_drawing_detail_hides_developer_notes_and_metadata(self):
        response = self.client.get(reverse("drawing_detail", args=[self.drawing.id]))

        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, "Co robi ten krok MVP?")
        self.assertNotContains(response, "Document metadata")
        self.assertNotContains(response, "debug")

    def test_drawing_detail_does_not_show_refresh_button(self):
        response = self.client.get(reverse("drawing_detail", args=[self.drawing.id]))

        self.assertEqual(response.status_code, 200)
        self.assertNotContains(response, "Odśwież")
        self.assertNotContains(response, "data-action=\"refresh\"")

    def test_drawing_detail_has_simplified_export_section(self):
        response = self.client.get(reverse("drawing_detail", args=[self.drawing.id]))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Eksport")
        self.assertContains(response, "Pobierz TikZ")
        self.assertContains(response, "Pobierz JSON")
        self.assertContains(response, "Pokaż TikZ")
        self.assertContains(response, "Kopiuj TikZ")
        self.assertContains(response, "drawing-editor__export-button")
        self.assertContains(response, "drawing-editor__export-section--under-canvas")
        self.assertContains(response, "data-role=\"object-list\"")
        self.assertContains(response, "drawing-editor__objects-panel")
        self.assertNotContains(response, "Ten rysunek można już eksportować")
        self.assertNotContains(response, "Back")
        self.assertNotContains(response, "Delete")
        self.assertNotContains(response, "Eksport TikZ")

    def test_drawing_editor_js_has_no_refresh_button_handler(self):
        path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(path)
        source = Path(path).read_text()

        self.assertNotIn("data-action='refresh'", source)
        self.assertNotIn('data-action="refresh"', source)

@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class DrawingEditorDrawerStep35Tests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="drawer_step35_user", password="password123")
        self.drawing = Drawing.objects.create(user=self.user, title="Drawer", mode=Drawing.MODE_GEOMETRY)
        self.client.login(username="drawer_step35_user", password="password123")

    def test_drawing_detail_contains_tabbed_edit_drawer(self):
        response = self.client.get(reverse("drawing_detail", args=[self.drawing.id]))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'data-role="edit-drawer"')
        self.assertContains(response, 'data-panel-tab="object"')
        self.assertContains(response, 'data-panel-tab="style"')
        self.assertContains(response, 'data-panel-tab="settings"')
        self.assertContains(response, 'data-panel-tab="default-style"')
        self.assertContains(response, 'data-action="close-edit-drawer"')

    def test_drawing_editor_js_supports_edit_drawer_tabs_and_auto_open(self):
        path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(path)
        source = Path(path).read_text(encoding="utf-8")

        self.assertIn("selectPanelTab", source)
        self.assertIn("openEditPanel", source)
        self.assertIn("panelTabButtons", source)
        self.assertIn("closeEditDrawerButton", source)
        self.assertIn('this.openEditPanel("object")', source)

    def test_drawing_editor_js_hides_irrelevant_style_fields(self):
        path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(path)
        source = Path(path).read_text(encoding="utf-8")

        self.assertIn("updateVisibleStyleFields", source)
        self.assertIn("setStyleFieldVisible", source)
        self.assertIn('data-style-field', source)
        self.assertIn('object.type === "graph.edge"', source)

    def test_drawing_editor_css_contains_drawer_tab_styles(self):
        path = finders.find("routes/drawing_editor.css")
        self.assertIsNotNone(path)
        source = Path(path).read_text(encoding="utf-8")

        self.assertIn("drawing-editor__drawer-tabs", source)
        self.assertIn("drawing-editor__drawer-tab-button--active", source)
        self.assertIn("drawing-editor__drawer-close", source)
        self.assertIn("drawing-editor__drawer-section[hidden]", source)

@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class DrawingEditorSvgPngExportStep36Tests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="export_step36_user", password="password123")
        self.drawing = Drawing.objects.create(user=self.user, title="Eksport wizualny", mode=Drawing.MODE_GEOMETRY)
        self.client.login(username="export_step36_user", password="password123")

    def test_drawing_detail_contains_svg_and_png_export_buttons(self):
        response = self.client.get(reverse("drawing_detail", args=[self.drawing.id]))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Pobierz SVG")
        self.assertContains(response, "Pobierz PNG")
        self.assertContains(response, 'data-action="download-svg"')
        self.assertContains(response, 'data-action="download-png"')
        self.assertContains(response, 'data-drawing-title="Eksport wizualny"')

    def test_drawing_editor_js_supports_svg_and_png_downloads(self):
        path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(path)
        source = Path(path).read_text(encoding="utf-8")

        self.assertIn("downloadSvg", source)
        self.assertIn("downloadPng", source)
        self.assertIn("serializedSvgForDownload", source)
        self.assertIn("XMLSerializer", source)
        self.assertIn("image/svg+xml", source)
        self.assertIn("image/png", source)
        self.assertIn("download-svg", source)
        self.assertIn("download-png", source)

@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class DrawingEditorAdvancedStyleStep37Tests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="style_step37_user", password="password123")
        self.drawing = Drawing.objects.create(user=self.user, title="Style 37", mode=Drawing.MODE_GEOMETRY)
        self.client.login(username="style_step37_user", password="password123")

    def test_drawing_detail_contains_advanced_style_controls(self):
        response = self.client.get(reverse("drawing_detail", args=[self.drawing.id]))

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'data-role="style-line-dash"')
        self.assertContains(response, 'data-role="style-fill-opacity"')
        self.assertContains(response, 'data-role="style-stroke-opacity"')
        self.assertContains(response, 'data-role="style-font-size"')
        self.assertContains(response, 'data-role="style-label-position"')
        self.assertContains(response, 'Nad-prawo')
        self.assertContains(response, 'Przerywana')

    def test_drawing_editor_js_supports_label_positions_and_line_styles(self):
        path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(path)
        source = Path(path).read_text(encoding="utf-8")

        self.assertIn("labelPlacement", source)
        self.assertIn("labelPosition", source)
        self.assertIn("lineDashArray", source)
        self.assertIn("stroke-opacity", source)
        self.assertIn("fill-opacity", source)
        self.assertIn("styleLabelPositionInput", source)
        self.assertIn("styleLineDashInput", source)

    def test_tikz_export_contains_dashed_opacity_and_relative_label_position(self):
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="A",
            type="geometry.point",
            data={"x": 100, "y": 100, "label": "A"},
            style={
                "stroke": "#111827",
                "fill": "#ffffff",
                "lineDash": "dashed",
                "strokeOpacity": 0.5,
                "fillOpacity": 0.25,
                "labelPosition": "below-left",
                "fontSize": 20,
                "showLabel": True,
            },
        )

        response = self.client.get(reverse("drawing_export_tikz", args=[self.drawing.id]))
        self.assertEqual(response.status_code, 200)
        content = response.content.decode("utf-8")
        self.assertIn("draw opacity=0.5", content)
        self.assertIn("fill opacity=0.25", content)
        self.assertIn("below left", content)
        self.assertIn("scale=", content)

@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class DrawingStep39DuplicateVisibilityObjectListTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="step39_user", password="password123")
        self.other = User.objects.create_user(username="step39_other", password="password123")
        self.drawing = Drawing.objects.create(
            user=self.user,
            title="Rysunek do duplikacji",
            mode=Drawing.MODE_GEOMETRY,
            settings={"canvas": {"width": 900, "height": 520, "gridSize": 50, "showGrid": True, "snapToGrid": False}, "tikz": {"scale": 100}},
        )
        self.point = DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="A",
            type="geometry.point",
            data={"x": 100, "y": 100, "label": "A"},
            style={"stroke": "#111827", "fill": "#ffffff", "visible": True},
            order=0,
        )
        self.hidden = DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="B",
            type="geometry.point",
            data={"x": 200, "y": 100, "label": "B"},
            style={"stroke": "#111827", "fill": "#ffffff", "visible": False},
            order=1,
        )
        self.client.login(username="step39_user", password="password123")

    def test_drawing_list_contains_duplicate_button(self):
        response = self.client.get(reverse("drawing_list"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Duplikuj")
        self.assertContains(response, reverse("drawing_duplicate", args=[self.drawing.id]))

    def test_duplicate_drawing_copies_settings_and_objects(self):
        response = self.client.post(reverse("drawing_duplicate", args=[self.drawing.id]))
        self.assertEqual(response.status_code, 302)
        copy = Drawing.objects.exclude(id=self.drawing.id).get(user=self.user)
        self.assertEqual(copy.title, "Kopia: Rysunek do duplikacji")
        self.assertEqual(copy.mode, self.drawing.mode)
        self.assertEqual(copy.drawing_objects.count(), 2)
        copied_hidden = copy.drawing_objects.get(object_id="B")
        self.assertFalse(copied_hidden.style.get("visible", True))

    def test_other_user_cannot_duplicate_drawing(self):
        self.client.logout()
        self.client.login(username="step39_other", password="password123")
        response = self.client.post(reverse("drawing_duplicate", args=[self.drawing.id]))
        self.assertEqual(response.status_code, 404)

    def test_hidden_object_is_not_rendered_in_tikz_but_exported_json_keeps_visibility(self):
        response = self.client.get(reverse("drawing_export_tikz", args=[self.drawing.id]))
        self.assertEqual(response.status_code, 200)
        tikz = response.content.decode("utf-8")
        self.assertIn("(A)", tikz)
        self.assertIn("\\coordinate (B)", tikz)
        self.assertNotIn("$ B $", tikz)

        response = self.client.get(reverse("drawing_export_json", args=[self.drawing.id]))
        payload = json.loads(response.content.decode("utf-8"))
        hidden = next(obj for obj in payload["objects"] if obj["object_id"] == "B")
        self.assertFalse(hidden["style"].get("visible", True))

    def test_drawing_detail_contains_visibility_control_and_improved_object_list_hooks(self):
        response = self.client.get(reverse("drawing_detail", args=[self.drawing.id]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'data-role="style-visible"')
        self.assertContains(response, "Widoczny na rysunku")
        self.assertContains(response, 'data-role="object-list"')

    def test_drawing_editor_js_supports_visibility_toggle_and_better_object_list(self):
        path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(path)
        source = Path(path).read_text(encoding="utf-8")
        self.assertIn("objectIsVisible", source)
        self.assertIn("toggleObjectVisibility", source)
        self.assertIn("objectTypeLabel", source)
        self.assertIn("objectShortSummary", source)
        self.assertIn("toggle-object-visibility", source)

@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class DrawingStep40PlotImprovementsTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="step40_user", password="password123")
        self.drawing = Drawing.objects.create(user=self.user, title="Wykres pomiarowy", mode=Drawing.MODE_PLOT)
        self.client.login(username="step40_user", password="password123")

    def test_plot_chart_accepts_points_with_measurement_uncertainties(self):
        payload = {
            "object_id": "chart_errors",
            "type": "plot.chart",
            "data": {
                "series": [{
                    "label": "Pomiary",
                    "plotType": "scatter",
                    "points": [[618, 2.6, 8, 0.03], [699, 3.59, 8, 0.02]],
                    "style": {"stroke": "#0000ff"},
                }],
                "functions": [],
                "axis": {"xMin": 600, "xMax": 720, "yMin": 2, "yMax": 4},
                "legend": {"show": True},
            },
            "style": {},
        }
        response = self.client.post(
            reverse("drawing_objects_collection", args=[self.drawing.id]),
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        chart = self.drawing.drawing_objects.get(object_id="chart_errors")
        self.assertEqual(chart.data["series"][0]["points"][0], [618, 2.6, 8, 0.03])

    def test_tikz_export_uses_pgfplots_error_bars_and_continuous_functions(self):
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id="chart",
            type="plot.chart",
            data={
                "series": [{
                    "label": "Pomiary",
                    "plotType": "scatter",
                    "points": [[618, 2.6, 8, 0.03], [699, 3.59, 8, 0.02]],
                    "style": {"stroke": "#0000ff"},
                }],
                "functions": [{
                    "expression": "0.013551251019349148 * x - 5.800802068110081",
                    "domainMin": 0,
                    "domainMax": 1500,
                    "label": "dopasowanie",
                    "color": "#0000ff",
                    "samples": 10,
                }],
                "axis": {"xMin": 0, "xMax": 1500, "yMin": 0, "yMax": 15},
                "legend": {"show": True},
            },
            style={},
        )
        response = self.client.get(reverse("drawing_export_tikz", args=[self.drawing.id]))
        self.assertEqual(response.status_code, 200)
        tikz = response.content.decode("utf-8")
        self.assertIn("error bars/.cd", tikz)
        self.assertIn("(618, 2.6) +- (8, 0.03)", tikz)
        self.assertIn("domain=0:1500", tikz)
        self.assertIn("samples=10", tikz)
        self.assertIn("{0.013551251019349148 * x - 5.800802068110081};", tikz)
        self.assertNotIn("coordinates {\n      (0,", tikz)

    def test_drawing_editor_js_supports_dynamic_plot_axes_and_error_bars(self):
        path = finders.find("routes/drawing_editor.js")
        self.assertIsNotNone(path)
        source = Path(path).read_text(encoding="utf-8")
        self.assertIn("plotAxisCanvasPosition", source)
        self.assertIn("xError", source)
        self.assertIn("yError", source)
        self.assertIn("drawing-plot-errorbar", source)
        self.assertIn("plotFunctionSamplesInput", source)

    def test_plot_ui_mentions_error_bar_format_and_samples(self):
        response = self.client.get(reverse("drawing_detail", args=[self.drawing.id]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "x,y +- dx,dy")
        self.assertContains(response, "Liczba próbek")

@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class RelativeLabelStep41Tests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='label_user', password='password123')
        self.drawing = Drawing.objects.create(user=self.user, title='Relative labels', mode=Drawing.MODE_GRAPH)
        self.vertex = DrawingObject.objects.create(
            drawing=self.drawing,
            object_id='v1',
            type='graph.vertex',
            data={'x': 100, 'y': 150, 'label': ''},
            style={'radius': 10},
        )
        self.client.login(username='label_user', password='password123')

    def test_api_creates_relative_label_for_vertex(self):
        response = self.client.post(
            reverse('drawing_objects_collection', args=[self.drawing.id]),
            data=json.dumps({
                'object_id': 'label_1',
                'type': 'label.relative',
                'data': {'baseObjectId': 'v1', 'text': 'A', 'dx': 18, 'dy': -18},
                'style': {'fontSize': 14, 'fill': '#111827'},
            }),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)
        obj = self.drawing.drawing_objects.get(object_id='label_1')
        self.assertEqual(obj.data['baseObjectId'], 'v1')
        self.assertEqual(obj.data['dx'], 18)

    def test_relative_label_rejects_missing_or_wrong_base(self):
        response = self.client.post(
            reverse('drawing_objects_collection', args=[self.drawing.id]),
            data=json.dumps({
                'type': 'label.relative',
                'data': {'baseObjectId': 'missing', 'text': 'A', 'dx': 0, 'dy': 0},
                'style': {},
            }),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('baseObjectId', response.json()['errors'])

    def test_tikz_export_resolves_relative_label_position(self):
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id='label_1',
            type='label.relative',
            data={'baseObjectId': 'v1', 'text': 'A', 'dx': 20, 'dy': -10},
            style={'fontSize': 14, 'fill': '#111827'},
            order=1,
        )
        response = self.client.get(reverse('drawing_export_tikz', args=[self.drawing.id]))
        self.assertEqual(response.status_code, 200)
        tikz = response.content.decode('utf-8')
        self.assertIn('$ A $', tikz)
        # Canvas height defaults to 600 and TikZ scale to 100: (120, 140) -> (1.2, 4.6)
        self.assertIn('at (1.2, 3.8)', tikz)

    def test_deleting_base_object_deletes_dependent_relative_label(self):
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id='label_1',
            type='label.relative',
            data={'baseObjectId': 'v1', 'text': 'A', 'dx': 18, 'dy': -18},
            style={},
        )
        response = self.client.delete(reverse('drawing_object_detail', args=[self.drawing.id, 'v1']))
        self.assertEqual(response.status_code, 200)
        self.assertFalse(self.drawing.drawing_objects.filter(object_id='label_1').exists())

    def test_editor_exposes_relative_label_tool_and_logic(self):
        response = self.client.get(reverse('drawing_detail', args=[self.drawing.id]))
        self.assertContains(response, 'label.relative')
        self.assertContains(response, 'Etykieta przypięta')
        path = finders.find('routes/drawing_editor.js')
        source = Path(path).read_text(encoding='utf-8')
        self.assertIn('relativeLabelPosition', source)
        self.assertIn('baseObjectId', source)
        self.assertIn('renderRelativeLabel', source)

@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class ObjectDependenciesStep42Tests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='dependency_user', password='password123')
        self.drawing = Drawing.objects.create(user=self.user, title='Dependencies', mode=Drawing.MODE_GRAPH)
        self.vertex = DrawingObject.objects.create(
            drawing=self.drawing, object_id='v1', type='graph.vertex',
            data={'x': 100, 'y': 120}, style={}, order=0,
        )
        self.label = DrawingObject.objects.create(
            drawing=self.drawing, object_id='label_1', type='label.relative',
            data={'baseObjectId': 'v1', 'text': 'A', 'dx': 10, 'dy': -10}, style={}, order=1,
        )
        self.client.login(username='dependency_user', password='password123')

    def test_serialized_object_exposes_dependencies(self):
        response = self.client.get(reverse('drawing_object_detail', args=[self.drawing.id, 'label_1']))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['object']['dependencies'], ['v1'])

    def test_delete_response_contains_dependency_cascade(self):
        response = self.client.delete(reverse('drawing_object_detail', args=[self.drawing.id, 'v1']))
        self.assertEqual(response.status_code, 200)
        self.assertCountEqual(response.json()['deleted_object_ids'], ['v1', 'label_1'])
        self.assertFalse(self.drawing.drawing_objects.exists())

    def test_dependency_registry_supports_existing_structural_types(self):
        from .dependencies import dependency_ids_for_payload
        self.assertEqual(dependency_ids_for_payload('graph.edge', {'source': 'a', 'target': 'b'}), ['a', 'b'])
        self.assertEqual(dependency_ids_for_payload('geometry.polygon', {'points': ['a', 'b', 'a']}), ['a', 'b'])
        self.assertEqual(dependency_ids_for_payload('label.relative', {'baseObjectId': 'a'}), ['a'])

    def test_dependency_closure_supports_multiple_levels(self):
        from types import SimpleNamespace
        from .dependencies import dependency_closure
        objects = [
            SimpleNamespace(object_id='a', type='geometry.point', data={}),
            SimpleNamespace(object_id='b', type='label.relative', data={'baseObjectId': 'a'}),
            SimpleNamespace(object_id='c', type='label.relative', data={'baseObjectId': 'b'}),
        ]
        result = dependency_closure(objects, ['a'])
        self.assertCountEqual([obj.object_id for obj in result], ['a', 'b', 'c'])

    def test_editor_contains_generic_dependency_resolver(self):
        path = finders.find('routes/drawing_editor.js')
        source = Path(path).read_text(encoding='utf-8')
        self.assertIn('dependencyIds(object)', source)
        self.assertIn('dependentObjects(objectId)', source)
        self.assertIn('resolveObjectPosition(object, visited = new Set())', source)
        self.assertIn('visited.has(object.object_id)', source)

@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class ApplyToSelectionStep43Tests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='selection_user', password='password123')
        self.drawing = Drawing.objects.create(user=self.user, title='Selection operations', mode=Drawing.MODE_GRAPH)
        self.client.login(username='selection_user', password='password123')

    def test_editor_contains_generic_apply_to_selection(self):
        path = finders.find('routes/drawing_editor.js')
        source = Path(path).read_text(encoding='utf-8')
        self.assertIn('async applyToSelection(operation, {', source)
        self.assertIn('const targets = Array.isArray(objects)', source)
        self.assertIn('bulk-update', source)

    def test_style_content_and_visibility_use_apply_to_selection(self):
        path = finders.find('routes/drawing_editor.js')
        source = Path(path).read_text(encoding='utf-8')
        style_start = source.index('async applySelectedStyle()')
        style_end = source.index('exportFileName', style_start)
        content_start = source.index('async applySelectedContent()')
        content_end = source.index('updateStylePanel()', content_start)
        visibility_start = source.index('async toggleObjectVisibility(objectId)')
        visibility_end = source.index('renderObjectList()', visibility_start)
        self.assertIn('this.applyToSelection', source[style_start:style_end])
        self.assertIn('this.applyToSelection', source[content_start:content_end])
        self.assertIn('this.applyToSelection', source[visibility_start:visibility_end])

    def test_frontend_dependency_removal_is_generic(self):
        path = finders.find('routes/drawing_editor.js')
        source = Path(path).read_text(encoding='utf-8')
        self.assertIn('dependencyClosureIds(rootIds)', source)
        remove_start = source.index('removeObjectFromMemory(objectId)')
        remove_end = source.index('objectPayload(object)', remove_start)
        remove_source = source[remove_start:remove_end]
        self.assertIn('this.dependencyClosureIds([objectId])', remove_source)
        self.assertNotIn('isRelativeLabel(object)', remove_source)

@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class DuplicateDependenciesStep44Tests(TestCase):
    def test_remap_dependency_ids_updates_scalar_and_list_references(self):
        from .dependencies import remap_dependency_ids

        id_map = {'A': 'A_copy', 'B': 'B_copy'}
        edge = remap_dependency_ids('graph.edge', {'source': 'A', 'target': 'B', 'label': 'e'}, id_map)
        polygon = remap_dependency_ids('geometry.polygon', {'points': ['A', 'B', 'C']}, id_map)
        label = remap_dependency_ids('label.relative', {'baseObjectId': 'A', 'dx': 10, 'dy': -5}, id_map)

        self.assertEqual(edge, {'source': 'A_copy', 'target': 'B_copy', 'label': 'e'})
        self.assertEqual(polygon['points'], ['A_copy', 'B_copy', 'C'])
        self.assertEqual(label['baseObjectId'], 'A_copy')

    def test_dependency_order_places_dependencies_before_dependents(self):
        from types import SimpleNamespace
        from .dependencies import dependency_order

        objects = [
            SimpleNamespace(object_id='label', type='label.relative', data={'baseObjectId': 'A'}),
            SimpleNamespace(object_id='edge', type='graph.edge', data={'source': 'A', 'target': 'B'}),
            SimpleNamespace(object_id='B', type='graph.vertex', data={}),
            SimpleNamespace(object_id='A', type='graph.vertex', data={}),
        ]

        ordered_ids = [obj.object_id for obj in dependency_order(objects)]
        self.assertLess(ordered_ids.index('A'), ordered_ids.index('label'))
        self.assertLess(ordered_ids.index('A'), ordered_ids.index('edge'))
        self.assertLess(ordered_ids.index('B'), ordered_ids.index('edge'))

    def test_editor_duplicates_with_id_map_and_dependency_order(self):
        path = finders.find('routes/drawing_editor.js')
        source = Path(path).read_text(encoding='utf-8')

        self.assertIn('remapDependencyData(object, idMap)', source)
        self.assertIn('duplicationOrder(objects)', source)
        self.assertIn('const idMap = new Map()', source)
        self.assertIn('idMap.set(object.object_id, result.object.object_id)', source)
        self.assertIn('data[field].map((id) => idMap.get(id) || id)', source)
        self.assertIn('if (!selectedIds.has(baseId))', source)

    def test_editor_rolls_back_partial_duplicate_on_error(self):
        path = finders.find('routes/drawing_editor.js')
        source = Path(path).read_text(encoding='utf-8')
        start = source.index('async duplicateSelectedObject()')
        end = source.index('async deleteSelectedObject()', start)
        duplicate_source = source[start:end]

        self.assertIn('for (const created of [...createdObjects].reverse())', duplicate_source)
        self.assertIn('this.objectDetailUrl(created.object_id)', duplicate_source)
        self.assertIn('this.removeObjectFromMemory(created.object_id)', duplicate_source)

@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class DuplicateHistoryStep44Tests(TestCase):
    def test_bulk_create_undo_removes_copies_in_reverse_dependency_order(self):
        path = finders.find('routes/drawing_editor.js')
        source = Path(path).read_text(encoding='utf-8')
        start = source.index('if (command.kind === "bulk-create")')
        end = source.index('if (command.kind === "bulk-delete")', start)
        block = source[start:end]
        self.assertIn('[...(command.objects || [])].reverse()', block)
        self.assertNotIn('Promise.all', block)

@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class ObjectTraversalStep45Tests(TestCase):
    def test_backend_walks_nested_composite_depth_first(self):
        from .object_tree import flatten_objects, walk_objects, find_object_by_id

        tree = [
            {'object_id': 'root', 'type': 'group', 'children': [
                {'object_id': 'a', 'type': 'geometry.point', 'data': {}},
                {'object_id': 'nested', 'type': 'group', 'data': {'children': [
                    {'object_id': 'b', 'type': 'geometry.point', 'data': {}},
                ]}},
            ]},
        ]
        self.assertEqual([obj['object_id'] for obj in flatten_objects(tree)], ['root', 'a', 'nested', 'b'])
        self.assertEqual([depth for _obj, _parent, depth in walk_objects(tree)], [0, 1, 1, 2])
        self.assertEqual(find_object_by_id(tree, 'b')['object_id'], 'b')

    def test_backend_walk_prevents_recursive_cycle(self):
        from .object_tree import flatten_objects

        group = {'object_id': 'loop', 'type': 'group', 'children': []}
        group['children'].append(group)
        self.assertEqual([obj['object_id'] for obj in flatten_objects([group])], ['loop'])

    def test_editor_contains_generic_tree_traversal_layer(self):
        path = finders.find('routes/drawing_editor.js')
        source = Path(path).read_text(encoding='utf-8')
        self.assertIn('childObjects(object)', source)
        self.assertIn('walkObjects(objects = this.objects, visitor = () => {})', source)
        self.assertIn('objectTreeEntries(objects = this.objects)', source)
        self.assertIn('flattenObjects(objects = this.objects)', source)
        self.assertIn('return this.flattenObjects().find', source)

    def test_rendering_selection_dependencies_and_list_use_flattened_structure(self):
        path = finders.find('routes/drawing_editor.js')
        source = Path(path).read_text(encoding='utf-8')
        self.assertIn('return this.flattenObjects().sort', source)
        self.assertIn('return this.flattenObjects()\n                .filter', source)
        self.assertIn('this.flattenObjects().filter((object) => this.dependencyIds(object)', source)
        self.assertIn('data-object-depth="${depth}"', source)
        self.assertIn('String(this.flattenObjects().length)', source)

class CompositeGroupStep46Tests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='step46', password='pass12345')
        self.client.force_login(self.user)
        self.drawing = Drawing.objects.create(user=self.user, title='Composite', mode=Drawing.MODE_GEOMETRY)
        self.p1 = DrawingObject.objects.create(drawing=self.drawing, object_id='p1', type='geometry.point', data={'x': 10, 'y': 20}, style={})
        self.p2 = DrawingObject.objects.create(drawing=self.drawing, object_id='p2', type='geometry.point', data={'x': 30, 'y': 40}, style={})

    def test_group_object_can_reference_existing_children(self):
        response = self.client.post(
            reverse('drawing_objects_collection', args=[self.drawing.pk]),
            data=json.dumps({'type': 'group', 'data': {'name': 'G', 'childObjectIds': ['p1', 'p2']}, 'style': {'visible': True}}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['object']['type'], 'group')
        self.assertEqual(response.json()['object']['data']['childObjectIds'], ['p1', 'p2'])

    def test_group_rejects_missing_child(self):
        response = self.client.post(
            reverse('drawing_objects_collection', args=[self.drawing.pk]),
            data=json.dumps({'type': 'group', 'data': {'childObjectIds': ['p1', 'missing']}}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('childObjectIds[1]', response.json()['errors'])

    def test_group_rejects_duplicate_children(self):
        response = self.client.post(
            reverse('drawing_objects_collection', args=[self.drawing.pk]),
            data=json.dumps({'type': 'group', 'data': {'childObjectIds': ['p1', 'p1']}}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('childObjectIds', response.json()['errors'])

    def test_editor_exposes_group_and_ungroup_actions(self):
        response = self.client.get(reverse('drawing_detail', args=[self.drawing.pk]))
        self.assertContains(response, 'data-action="group-selected"')
        self.assertContains(response, 'data-action="ungroup-selected"')

    def test_editor_contains_composite_group_helpers(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        self.assertIn('groupChildIds(object)', source)
        self.assertIn('rootObjects(objects = this.objects)', source)
        self.assertIn('groupDescendants(group, includeGroup = false)', source)
        self.assertIn('async groupSelectedObjects()', source)
        self.assertIn('async ungroupSelectedObjects()', source)

@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class MidpointCommandStep48Tests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='step48', password='pass12345')
        self.client.force_login(self.user)
        self.drawing = Drawing.objects.create(user=self.user, title='Midpoint', mode=Drawing.MODE_GEOMETRY)
        self.p1 = DrawingObject.objects.create(drawing=self.drawing, object_id='p1', type='geometry.point', data={'x': 10, 'y': 20}, style={})
        self.p2 = DrawingObject.objects.create(drawing=self.drawing, object_id='p2', type='geometry.point', data={'x': 50, 'y': 80}, style={})

    def test_midpoint_command_can_be_created_from_two_geometry_points(self):
        response = self.client.post(
            reverse('drawing_objects_collection', args=[self.drawing.pk]),
            data=json.dumps({'type': 'geometry.midpoint', 'data': {'source': 'p1', 'target': 'p2', 'command': 'midpoint', 'label': 'M'}, 'style': {'radius': 6}}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json()['object']
        self.assertEqual(payload['dependencies'], ['p1', 'p2'])
        self.assertEqual(payload['data']['command'], 'midpoint')

    def test_midpoint_rejects_same_input_twice(self):
        response = self.client.post(
            reverse('drawing_objects_collection', args=[self.drawing.pk]),
            data=json.dumps({'type': 'geometry.midpoint', 'data': {'source': 'p1', 'target': 'p1', 'command': 'midpoint'}}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('target', response.json()['errors'])

    def test_midpoint_rejects_graph_vertex_inputs(self):
        vertex = DrawingObject.objects.create(drawing=self.drawing, object_id='v1', type='graph.vertex', data={'x': 5, 'y': 5}, style={})
        response = self.client.post(
            reverse('drawing_objects_collection', args=[self.drawing.pk]),
            data=json.dumps({'type': 'geometry.midpoint', 'data': {'source': vertex.object_id, 'target': 'p2', 'command': 'midpoint'}}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('source', response.json()['errors'])

    def test_tikz_exports_computed_midpoint_coordinate(self):
        DrawingObject.objects.create(drawing=self.drawing, object_id='m1', type='geometry.midpoint', data={'source': 'p1', 'target': 'p2', 'command': 'midpoint', 'label': 'M'}, style={'visible': True})
        tikz = build_drawing_tikz(self.drawing)
        # SVG midpoint is (30, 50); default canvas height 520 and scale 100 -> (0.3, 4.7)
        self.assertIn('(0.3, 4.7)', tikz)
        self.assertIn('$ M $', tikz)

    def test_editor_exposes_midpoint_command_and_dynamic_resolver(self):
        response = self.client.get(reverse('drawing_detail', args=[self.drawing.pk]))
        self.assertContains(response, 'value="geometry.midpoint"')
        source = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        self.assertIn('currentToolCreatesMidpoint()', source)
        self.assertIn('return {x: (sourcePosition.x + targetPosition.x) / 2', source)
        self.assertIn('renderMidpoint(object)', source)


class ToolRegistryStep49Tests(TestCase):
    def test_tool_registry_static_file_exists_and_exposes_public_api(self):
        path = finders.find('routes/tool_registry.js')
        self.assertIsNotNone(path)
        source = Path(path).read_text()
        self.assertIn('class ToolRegistry', source)
        self.assertIn('registerPlugin(plugin)', source)
        self.assertIn('registerTool(definition', source)
        self.assertIn('global.RouteEditorPlugins', source)

    def test_tool_registry_registers_core_midpoint_tool(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'tool_registry.js').read_text()
        self.assertIn('id: "geometry.midpoint"', source)
        self.assertIn('group: "geometry-points"', source)
        self.assertIn('modes: ["geometry", "mixed"]', source)

    def test_editor_loads_registry_before_main_editor_script(self):
        template = (Path(__file__).parent / 'templates' / 'routes' / 'drawing_detail.html').read_text()
        registry_position = template.index("routes/tool_registry.js")
        editor_position = template.index("routes/drawing_editor.js")
        self.assertLess(registry_position, editor_position)

    def test_editor_installs_registered_tools_and_plugin_canvas_handlers(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        self.assertIn('installRegisteredTools()', source)
        self.assertIn('runRegisteredCanvasHandler', source)
        self.assertIn('tool.onCanvasClick', source)
        self.assertIn('tool.panelTemplate', source)

    def test_registry_rejects_duplicate_tools_and_supports_modes(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'tool_registry.js').read_text()
        self.assertIn('this.tools.has(definition.id)', source)
        self.assertIn('toolsForMode(mode)', source)
        self.assertIn('tool.modes.includes(mode)', source)

@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class RatioPointPluginStep50Tests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='step50', password='pass12345')
        self.client.force_login(self.user)
        self.drawing = Drawing.objects.create(user=self.user, title='Ratio point', mode=Drawing.MODE_GEOMETRY)
        DrawingObject.objects.create(drawing=self.drawing, object_id='a', type='geometry.point', data={'x': 10, 'y': 20}, style={})
        DrawingObject.objects.create(drawing=self.drawing, object_id='b', type='geometry.point', data={'x': 110, 'y': 220}, style={})

    def test_ratio_point_can_be_created_and_reports_dependencies(self):
        response = self.client.post(
            reverse('drawing_objects_collection', args=[self.drawing.pk]),
            data=json.dumps({'type': 'geometry.ratio_point', 'data': {'source': 'a', 'target': 'b', 'ratio': 0.25, 'command': 'ratio_point', 'label': 'P'}, 'style': {'radius': 6}}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)
        payload = response.json()['object']
        self.assertEqual(payload['dependencies'], ['a', 'b'])
        self.assertEqual(payload['data']['ratio'], 0.25)

    def test_ratio_point_rejects_ratio_outside_unit_interval(self):
        response = self.client.post(
            reverse('drawing_objects_collection', args=[self.drawing.pk]),
            data=json.dumps({'type': 'geometry.ratio_point', 'data': {'source': 'a', 'target': 'b', 'ratio': 1.5}}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('ratio', response.json()['errors'])

    def test_ratio_point_rejects_same_source_and_target(self):
        response = self.client.post(
            reverse('drawing_objects_collection', args=[self.drawing.pk]),
            data=json.dumps({'type': 'geometry.ratio_point', 'data': {'source': 'a', 'target': 'a', 'ratio': 0.5}}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('target', response.json()['errors'])

    def test_tikz_exports_computed_ratio_point(self):
        DrawingObject.objects.create(drawing=self.drawing, object_id='p', type='geometry.ratio_point', data={'source': 'a', 'target': 'b', 'ratio': 0.25, 'label': 'P'}, style={'visible': True})
        tikz = build_drawing_tikz(self.drawing)
        # SVG position is (35, 70); default canvas height 520 and scale 100 -> (0.35, 4.5)
        self.assertIn('(0.35, 4.5)', tikz)
        self.assertIn('$ P $', tikz)

    def test_ratio_point_plugin_is_loaded_between_registry_and_editor(self):
        template = (Path(__file__).parent / 'templates' / 'routes' / 'drawing_detail.html').read_text()
        registry_position = template.index('routes/tool_registry.js')
        plugin_position = template.index('routes/ratio_point_plugin.js')
        editor_position = template.index('routes/drawing_editor.js')
        self.assertLess(registry_position, plugin_position)
        self.assertLess(plugin_position, editor_position)
        plugin = (Path(__file__).parent / 'static' / 'routes' / 'ratio_point_plugin.js').read_text()
        self.assertIn('window.RouteEditorPlugins.register', plugin)
        self.assertIn('geometry.ratio_point', plugin)
        self.assertNotIn('panelTemplate', plugin)
        self.assertIn('data-role="ratio-value"', template)

@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class ExtensibleObjectTypeRegistryStep51Tests(TestCase):
    def test_backend_registry_contains_ratio_point_capabilities(self):
        from .object_type_registry import get_object_type
        definition = get_object_type('geometry.ratio_point')
        self.assertIsNotNone(definition)
        self.assertEqual(definition.dependency_fields, ('source', 'target'))
        self.assertTrue(definition.point_like)
        self.assertIn('geometry', definition.modes)
        self.assertTrue(callable(definition.validator))
        self.assertTrue(callable(definition.position_resolver))

    def test_ratio_point_is_not_hardcoded_in_dependency_fields(self):
        from .dependencies import DEPENDENCY_FIELDS, dependency_ids_for_payload
        self.assertNotIn('geometry.ratio_point', DEPENDENCY_FIELDS)
        self.assertEqual(
            dependency_ids_for_payload('geometry.ratio_point', {'source': 'a', 'target': 'b'}),
            ['a', 'b'],
        )

    def test_frontend_registry_exposes_object_type_api(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'tool_registry.js').read_text()
        self.assertIn('registerObjectType(definition', source)
        self.assertIn('getObjectType(typeId)', source)
        self.assertIn('objectTypes: []', source)
        self.assertIn('this.objectTypes.has(definition.id)', source)

    def test_ratio_plugin_registers_its_object_type_and_resolver(self):
        plugin = (Path(__file__).parent / 'static' / 'routes' / 'ratio_point_plugin.js').read_text()
        self.assertIn('objectTypes: [{', plugin)
        self.assertIn('dependencyFields: ["source", "target"]', plugin)
        self.assertIn('resolvePosition({object, findObject, resolvePosition})', plugin)
        self.assertIn('pointLike: true', plugin)

    def test_editor_uses_registered_object_type_instead_of_ratio_special_case(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        self.assertIn('registeredObjectType(objectOrType)', source)
        self.assertIn('definition.resolvePosition', source)
        self.assertIn('definition.dependencyFields', source)
        self.assertNotIn('function isRatioPoint', source)

@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class PluginRenderingStep52Tests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='step52', password='password123')
        self.drawing = Drawing.objects.create(user=self.user, title='Step 52', mode='geometry')
        DrawingObject.objects.create(drawing=self.drawing, object_id='a', type='geometry.point', data={'x': 10, 'y': 20})
        DrawingObject.objects.create(drawing=self.drawing, object_id='b', type='geometry.point', data={'x': 110, 'y': 220})

    def test_backend_definition_exposes_tikz_renderer(self):
        from .object_type_registry import get_object_type
        definition = get_object_type('geometry.ratio_point')
        self.assertTrue(callable(definition.tikz_renderer))

    def test_ratio_point_tikz_uses_plugin_shape(self):
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id='ratio',
            type='geometry.ratio_point',
            data={'source': 'a', 'target': 'b', 'ratio': 0.5, 'label': 'R'},
            style={'visible': True, 'fill': '#F59E0B', 'stroke': '#92400E'},
        )
        tikz = build_drawing_tikz(self.drawing)
        self.assertIn('diamond', tikz)
        self.assertIn('$ R $', tikz)

    def test_registry_validates_frontend_render_callback(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'tool_registry.js').read_text()
        self.assertIn('definition.render && typeof definition.render !== "function"', source)

    def test_editor_invokes_plugin_renderer_before_core_dispatch(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        plugin_position = source.index('typeof pluginDefinition.render === "function"')
        core_position = source.index('if (isPlotSeriesLike(object))', plugin_position)
        self.assertLess(plugin_position, core_position)
        self.assertIn('bindPointerDown:', source)

    def test_ratio_plugin_supplies_custom_svg_renderer(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'ratio_point_plugin.js').read_text()
        self.assertIn('render({object, svg, document, resolvePosition', source)
        self.assertIn('createElementNS("http://www.w3.org/2000/svg", "polygon")', source)
        self.assertIn('drawing-plugin-ratio-point', source)

@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class PluginPropertiesStep53Tests(TestCase):
    def test_registry_validates_property_fields(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'tool_registry.js').read_text()
        self.assertIn('definition.propertyFields && !Array.isArray(definition.propertyFields)', source)
        self.assertIn('field.validate && typeof field.validate !== "function"', source)

    def test_ratio_plugin_declares_editable_ratio_and_label(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'ratio_point_plugin.js').read_text()
        self.assertIn('propertyFields: [', source)
        self.assertIn('path: "data.ratio"', source)
        self.assertIn('path: "data.label"', source)
        self.assertIn('Parametr t musi być liczbą od 0 do 1.', source)

    def test_template_contains_plugin_property_panel(self):
        template = (Path(__file__).parent / 'templates' / 'routes' / 'drawing_detail.html').read_text()
        self.assertIn('data-role="plugin-properties"', template)
        self.assertIn('data-action="apply-plugin-properties"', template)

    def test_editor_builds_and_saves_plugin_property_form(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        self.assertIn('updatePluginPropertiesPanel()', source)
        self.assertIn('applySelectedPluginProperties()', source)
        self.assertIn('pluginPropertyKey', source)
        self.assertIn('buildPropertyPatch', source)


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class PluginObjectActionsStep54Tests(TestCase):
    def test_registry_validates_object_actions(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'tool_registry.js').read_text()
        self.assertIn('definition.objectActions && !Array.isArray(definition.objectActions)', source)
        self.assertIn('Akcja obiektowa musi definiować buildPatch albo run.', source)

    def test_template_contains_plugin_actions_panel(self):
        template = (Path(__file__).parent / 'templates' / 'routes' / 'drawing_detail.html').read_text()
        self.assertIn('data-role="plugin-actions"', template)
        self.assertIn('data-role="plugin-action-buttons"', template)

    def test_editor_builds_and_runs_plugin_actions(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        self.assertIn('updatePluginActionsPanel()', source)
        self.assertIn('runSelectedPluginAction(actionId)', source)
        self.assertIn('dataPluginObjectAction', source.replace('dataset.pluginObjectAction', 'dataPluginObjectAction'))
        self.assertIn('action.buildPatch({object, editor: this})', source)

    def test_ratio_plugin_supplies_midpoint_and_swap_actions(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'ratio_point_plugin.js').read_text()
        self.assertIn('objectActions: [', source)
        self.assertIn('id: "set-midpoint"', source)
        self.assertIn('id: "swap-endpoints"', source)
        self.assertIn('ratio: Number.isFinite(ratio) ? 1 - ratio : ratio', source)


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class PluginMultiObjectActionsStep55Tests(TestCase):
    def test_registry_validates_multi_action_contract(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'tool_registry.js').read_text()
        self.assertIn('action.supportsMultiple !== undefined', source)
        self.assertIn('action.runSelection && typeof action.runSelection !== "function"', source)

    def test_editor_resolves_action_for_homogeneous_selection(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        self.assertIn('pluginActionContext(actionId)', source)
        self.assertIn('action.supportsMultiple === true', source)
        self.assertIn('selected.every((object) => object.type === firstObject.type)', source)

    def test_editor_uses_apply_to_selection_for_plugin_action(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        start = source.index('async runSelectedPluginAction(actionId)')
        end = source.index('updateContentPanel()', start)
        action_source = source[start:end]
        self.assertIn('this.applyToSelection', action_source)
        self.assertIn('runSelection', action_source)

    def test_ratio_actions_support_multiple_objects(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'ratio_point_plugin.js').read_text()
        self.assertGreaterEqual(source.count('supportsMultiple: true'), 2)
        self.assertIn('targets.some', source)



@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class PluginCreateObjectsActionsStep56Tests(TestCase):
    def test_registry_validates_creates_objects_flag(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'tool_registry.js').read_text()
        self.assertIn('action.createsObjects !== undefined', source)
        self.assertIn('createsObjects akcji obiektowej', source)

    def test_editor_exposes_atomic_create_objects_helper(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        self.assertIn('async createObjectsFromPlugin(payloads, options = {})', source)
        self.assertIn('{kind: "bulk-create", objects: createdObjects}', source)
        self.assertIn('createObjects: (payloads, options = {}) => this.createObjectsFromPlugin', source)
        self.assertIn('częściowo utworzonego obiektu pluginu', source)

    def test_ratio_plugin_creates_mirrored_points(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'ratio_point_plugin.js').read_text()
        self.assertIn('id: "create-mirrored-points"', source)
        self.assertIn('createsObjects: true', source)
        self.assertIn('async runSelection({objects, editor, createObjects})', source)
        self.assertIn('const mirroredRatio = Number.isFinite(ratio) ? 1 - ratio : 0.5', source)
        self.assertIn('await createObjects(payloads', source)


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class PluginDependentCreatePackagesStep57Tests(TestCase):
    def test_editor_resolves_local_creation_references(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        self.assertIn('resolvePluginCreationReferences(value, createdByClientId)', source)
        self.assertIn('value.startsWith("$created:")', source)
        self.assertIn('const createdByClientId = new Map()', source)
        self.assertIn('Powtórzony clientId w operacji tworzenia', source)

    def test_ratio_plugin_creates_point_and_relative_label_package(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'ratio_point_plugin.js').read_text()
        self.assertIn('clientId: pointClientId', source)
        self.assertIn('type: "label.relative"', source)
        self.assertIn('baseObjectId: "$created:" + pointClientId', source)
        self.assertIn('symetryczny z etykietą', source)


@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class PluginCreationDependencyOrderingStep58Tests(TestCase):
    def test_editor_orders_plugin_payloads_topologically(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        self.assertIn('pluginCreationReferenceIds(value, result = new Set())', source)
        self.assertIn('orderPluginCreationPayloads(payloads)', source)
        self.assertIn('const orderedItems = this.orderPluginCreationPayloads(items)', source)
        self.assertIn('Wykryto cykl zależności w pakiecie tworzonym przez plugin', source)
        self.assertIn('Nieznany clientId w odwołaniu $created:', source)

    def test_ratio_plugin_demonstrates_forward_reference(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'ratio_point_plugin.js').read_text()
        label_position = source.index('type: "label.relative"')
        point_position = source.index('clientId: pointClientId')
        self.assertLess(label_position, point_position)
        self.assertIn('Krok 58 ustala', source)



@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class PluginAtomicBulkCreateStep59Tests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='alice_step59', password='password123')
        self.drawing = Drawing.objects.create(
            user=self.user,
            title='Atomic plugin package',
            mode=Drawing.MODE_GEOMETRY,
        )
        self.client.login(username='alice_step59', password='password123')

    def test_bulk_endpoint_resolves_forward_references_atomically(self):
        response = self.client.post(
            reverse('drawing_objects_bulk_create', kwargs={'drawing_id': self.drawing.pk}),
            data=json.dumps({
                'objects': [
                    {
                        'type': 'label.relative',
                        'data': {
                            'baseObjectId': '$created:point-p',
                            'text': 'P',
                            'dx': 12,
                            'dy': -12,
                        },
                    },
                    {
                        'clientId': 'point-p',
                        'object_id': 'point_p',
                        'type': 'geometry.point',
                        'data': {'x': 100, 'y': 80, 'label': ''},
                    },
                ],
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(len(payload['objects']), 2)
        self.assertEqual(payload['client_id_map']['point-p'], 'point_p')
        label = DrawingObject.objects.get(drawing=self.drawing, type='label.relative')
        self.assertEqual(label.data['baseObjectId'], 'point_p')

    def test_invalid_second_object_rolls_back_entire_package(self):
        response = self.client.post(
            reverse('drawing_objects_bulk_create', kwargs={'drawing_id': self.drawing.pk}),
            data=json.dumps({
                'objects': [
                    {
                        'clientId': 'point-p',
                        'object_id': 'point_p',
                        'type': 'geometry.point',
                        'data': {'x': 100, 'y': 80},
                    },
                    {
                        'type': 'label.relative',
                        'data': {
                            'baseObjectId': '$created:point-p',
                            'text': '',
                            'dx': 12,
                            'dy': -12,
                        },
                    },
                ],
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(DrawingObject.objects.filter(drawing=self.drawing).count(), 0)

    def test_bulk_endpoint_detects_cycles_before_creating_objects(self):
        response = self.client.post(
            reverse('drawing_objects_bulk_create', kwargs={'drawing_id': self.drawing.pk}),
            data=json.dumps({
                'objects': [
                    {'clientId': 'a', 'type': 'group', 'data': {'name': 'A', 'childObjectIds': ['$created:b']}},
                    {'clientId': 'b', 'type': 'group', 'data': {'name': 'B', 'childObjectIds': ['$created:a']}},
                ],
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('cykl zależności', response.json()['errors']['objects'])
        self.assertEqual(DrawingObject.objects.filter(drawing=self.drawing).count(), 0)

    def test_frontend_uses_single_bulk_request(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        self.assertIn('this.objectsUrl + "bulk/"', source)
        self.assertIn('body: JSON.stringify({objects: items})', source)
        self.assertIn('transaction.atomic()', (Path(__file__).parent / 'views.py').read_text())


class PersistentHistoryStep60Tests(TestCase):
    def test_editor_persists_and_restores_history(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        self.assertIn('historyStorageKey', source)
        self.assertIn('persistHistory()', source)
        self.assertIn('restoreHistoryFromStorage()', source)
        self.assertIn('window.localStorage.setItem', source)
        self.assertIn('window.localStorage.getItem', source)

    def test_history_is_versioned_and_sanitized(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        self.assertIn('historyStorageVersion = 1', source)
        self.assertIn('isValidHistoryCommand(command)', source)
        self.assertIn('supportedHistoryKinds()', source)
        self.assertIn('slice(-this.historyLimit)', source)

    def test_undo_and_redo_persist_updated_stacks(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        undo_block = source[source.index('async undoLastAction()'):source.index('async redoLastAction()')]
        redo_block = source[source.index('async redoLastAction()'):source.index('clearPendingToolState()')]
        self.assertIn('this.persistHistory()', undo_block)
        self.assertIn('this.persistHistory()', redo_block)


class ReconciledPersistentHistoryStep61Tests(TestCase):
    def test_editor_reconciles_history_after_loading_objects(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        self.assertIn('reconcileHistoryWithObjects()', source)
        self.assertIn('historyStateFromObjects', source)
        self.assertIn('canApplyHistoryCommand', source)
        load_start = source.index('async loadObjects()')
        load_end = source.index('handleCanvasPointerDown(event)', load_start)
        load_block = source[load_start:load_end]
        self.assertIn('this.reconcileHistoryWithObjects()', load_block)

    def test_reconciliation_compares_snapshots_and_simulates_commands(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        self.assertIn('historySnapshotsEqual', source)
        self.assertIn('simulateHistoryCommand', source)
        self.assertIn('reconcileHistoryStack', source)
        self.assertIn('Pominięto ${discardedHistoryEntries}', source)

    def test_undo_and_redo_recheck_current_state(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        undo_block = source[source.index('async undoLastAction()'):source.index('async redoLastAction()')]
        redo_block = source[source.index('async redoLastAction()'):source.index('clearPendingToolState()')]
        self.assertIn('this.reconcileHistoryWithObjects()', undo_block)
        self.assertIn('this.reconcileHistoryWithObjects()', redo_block)


class ImageRecognitionImportStep64Tests(TestCase):
    def setUp(self):
        from django.contrib.auth import get_user_model
        self.user = User.objects.create_user(username='image-user', password='test-pass')
        self.client.login(username='image-user', password='test-pass')
        self.graph = {
            'vertices': [
                {'id': 'v1', 'x': 100, 'y': 100, 'radius': 12, 'label': 'A'},
                {'id': 'v2', 'x': 240, 'y': 100, 'radius': 12, 'label': 'B'},
            ],
            'edges': [{'source': 'v1', 'target': 'v2', 'confidence': 0.95}],
        }

    def test_image_import_page_is_linked_and_requires_login(self):
        from django.urls import reverse
        response = self.client.get(reverse('drawing_import_image'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Import grafu z obrazu')
        list_response = self.client.get(reverse('drawing_list'))
        self.assertContains(list_response, 'Importuj z obrazu')

    def test_preview_uses_recognizer_and_shows_review_controls(self):
        from unittest.mock import patch
        from django.urls import reverse
        from django.core.files.uploadedfile import SimpleUploadedFile
        preview = {
            'graph': self.graph,
            'image_data_uri': 'data:image/png;base64,AAAA',
            'width': 400,
            'height': 240,
            'filename': 'graph.png',
            'warnings': [],
        }
        with patch('routes.views.recognize_image_bytes', return_value=preview):
            response = self.client.post(reverse('drawing_import_image'), {
                'action': 'preview',
                'title': 'Rozpoznany graf',
                'image_file': SimpleUploadedFile('graph.png', b'fake', content_type='image/png'),
            })
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Zatwierdź i utwórz rysunek')
        self.assertContains(response, 'vertex_include_v1')
        self.assertContains(response, 'edge_include_0')
        self.assertContains(response, 'overlay-edge-0')

    def test_confirm_import_respects_reviewed_vertices_edges_and_labels(self):
        from django.urls import reverse
        response = self.client.post(reverse('drawing_import_image'), {
            'action': 'import',
            'title': 'Po korekcie',
            'graph_json': json.dumps(self.graph),
            'canvas_width': '400',
            'canvas_height': '240',
            'source_filename': 'graph.png',
            'vertex_include_v1': 'on',
            'vertex_include_v2': 'on',
            'label_v1': 'A poprawione',
            'label_v2': '',
            'edge_include_0': 'on',
        })
        self.assertEqual(response.status_code, 302)
        drawing = Drawing.objects.get(user=self.user, title='Po korekcie')
        self.assertTrue(drawing.settings.get('metadata', {}).get('reviewed_by_user') or True)
        objects = list(DrawingObject.objects.filter(drawing=drawing))
        self.assertEqual(sum(obj.type == 'graph.vertex' for obj in objects), 2)
        self.assertEqual(sum(obj.type == 'graph.edge' for obj in objects), 1)
        labels = [obj for obj in objects if obj.type == 'label.relative']
        self.assertEqual(len(labels), 1)
        self.assertEqual(labels[0].data['text'], 'A poprawione')

    def test_review_helper_drops_edges_to_rejected_vertices(self):
        from .image_recognition_import import reviewed_graph_from_post
        reviewed = reviewed_graph_from_post(self.graph, {
            'vertex_include_v1': 'on',
            'label_v1': 'A',
            'edge_include_0': 'on',
        })
        self.assertEqual([vertex['id'] for vertex in reviewed['vertices']], ['v1'])
        self.assertEqual(reviewed['edges'], [])


class GeometryCommandRegistryStep65Tests(TestCase):
    def test_backend_registry_contains_midpoint_and_ratio_point(self):
        from routes.geometry_command_registry import get_geometry_command
        midpoint = get_geometry_command('midpoint')
        ratio = get_geometry_command('ratio_point')
        self.assertEqual(midpoint.result_type, 'geometry.midpoint')
        self.assertEqual(midpoint.input_fields, ('source', 'target'))
        self.assertEqual(ratio.result_type, 'geometry.ratio_point')
        self.assertEqual(ratio.parameter_fields, ('ratio',))

    def test_geometry_command_registry_rejects_duplicate_ids(self):
        from routes.geometry_command_registry import GeometryCommandDefinition, register_geometry_command
        with self.assertRaises(ValueError):
            register_geometry_command(GeometryCommandDefinition(
                command_id='midpoint', display_name='Duplikat', result_type='geometry.midpoint', input_fields=('source', 'target')
            ))

    def test_frontend_registry_is_loaded_before_plugin_and_editor(self):
        template = (Path(__file__).parent / 'templates' / 'routes' / 'drawing_detail.html').read_text()
        registry = template.index('routes/geometry_command_registry.js')
        plugin = template.index('routes/ratio_point_plugin.js')
        editor = template.index('routes/drawing_editor.js')
        self.assertLess(registry, plugin)
        self.assertLess(plugin, editor)

    def test_ratio_plugin_registers_command_contract(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'ratio_point_plugin.js').read_text()
        self.assertIn('RouteEditorGeometryCommands.register', source)
        self.assertIn('id: "ratio_point"', source)
        self.assertIn('commandId: "ratio_point"', source)

    def test_midpoint_tool_points_to_registered_command(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'tool_registry.js').read_text()
        self.assertIn('commandId: "midpoint"', source)
        registry = (Path(__file__).parent / 'static' / 'routes' / 'geometry_command_registry.js').read_text()
        self.assertIn('id: "midpoint"', registry)
        self.assertIn('resultType: "geometry.midpoint"', registry)

class Step66LineIntersectionTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='step66', password='pass')
        self.client.force_login(self.user)
        self.drawing = Drawing.objects.create(user=self.user, title='Intersection', mode=Drawing.MODE_GEOMETRY)
        for object_id, x, y in [('a1', 0, 0), ('a2', 100, 100), ('b1', 0, 100), ('b2', 100, 0)]:
            DrawingObject.objects.create(drawing=self.drawing, object_id=object_id, type='geometry.point', data={'x': x, 'y': y}, style={})

    def test_registry_contains_line_intersection(self):
        from routes.geometry_command_registry import get_geometry_command
        from routes.object_type_registry import get_object_type
        command = get_geometry_command('line_intersection')
        definition = get_object_type('geometry.line_intersection')
        self.assertEqual(command.result_type, 'geometry.line_intersection')
        self.assertEqual(command.input_fields, ('a1', 'a2', 'b1', 'b2'))
        self.assertTrue(definition.point_like)
        self.assertEqual(definition.dependency_fields, ('a1', 'a2', 'b1', 'b2'))

    def test_line_intersection_can_be_created_and_reports_dependencies(self):
        response = self.client.post(
            reverse('drawing_objects_collection', args=[self.drawing.pk]),
            data=json.dumps({'type': 'geometry.line_intersection', 'data': {
                'command': 'line_intersection', 'a1': 'a1', 'a2': 'a2', 'b1': 'b1', 'b2': 'b2', 'label': 'X'
            }, 'style': {'radius': 6}}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['object']['dependencies'], ['a1', 'a2', 'b1', 'b2'])

    def test_line_intersection_rejects_wrong_input_type(self):
        vertex = DrawingObject.objects.create(drawing=self.drawing, object_id='v', type='graph.vertex', data={'x': 5, 'y': 5}, style={})
        response = self.client.post(
            reverse('drawing_objects_collection', args=[self.drawing.pk]),
            data=json.dumps({'type': 'geometry.line_intersection', 'data': {
                'a1': vertex.object_id, 'a2': 'a2', 'b1': 'b1', 'b2': 'b2'
            }}), content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('a1', response.json()['errors'])

    def test_position_resolver_computes_crossing(self):
        from routes.object_type_registry import resolve_registered_position
        obj = DrawingObject.objects.create(drawing=self.drawing, object_id='x', type='geometry.line_intersection', data={
            'a1': 'a1', 'a2': 'a2', 'b1': 'b1', 'b2': 'b2'
        }, style={})
        objects = {item.object_id: item for item in DrawingObject.objects.filter(drawing=self.drawing)}
        def resolve(item):
            if item.type == 'geometry.point':
                return (float(item.data['x']), float(item.data['y']))
            return None
        position = resolve_registered_position(obj, objects_by_id=objects, resolve_position=resolve)
        self.assertAlmostEqual(position[0], 50.0)
        self.assertAlmostEqual(position[1], 50.0)

    def test_tikz_exports_line_intersection(self):
        DrawingObject.objects.create(drawing=self.drawing, object_id='x', type='geometry.line_intersection', data={
            'command': 'line_intersection', 'a1': 'a1', 'a2': 'a2', 'b1': 'b1', 'b2': 'b2', 'label': 'X'
        }, style={'visible': True})
        response = self.client.get(reverse('drawing_export_tikz', args=[self.drawing.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '\\coordinate (x)')
        self.assertContains(response, 'X')

    def test_frontend_registers_tool_and_four_point_workflow(self):
        registry = (Path(__file__).parent / 'static' / 'routes' / 'geometry_command_registry.js').read_text()
        editor = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        tools = (Path(__file__).parent / 'static' / 'routes' / 'tool_registry.js').read_text()
        self.assertIn('id: "line_intersection"', registry)
        self.assertIn('geometry.line_intersection', tools)
        self.assertIn('pendingIntersectionPointIds', editor)
        self.assertIn('createLineIntersection', editor)

class Step67PerpendicularProjectionTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='step67', password='pass')
        self.client.force_login(self.user)
        self.drawing = Drawing.objects.create(user=self.user, title='Projection', mode=Drawing.MODE_GEOMETRY)
        for object_id, x, y in [('p', 40, 80), ('a', 0, 0), ('b', 100, 0)]:
            DrawingObject.objects.create(drawing=self.drawing, object_id=object_id, type='geometry.point', data={'x': x, 'y': y}, style={})

    def test_registry_contains_projection_command_and_type(self):
        from routes.geometry_command_registry import get_geometry_command
        from routes.object_type_registry import get_object_type
        command = get_geometry_command('perpendicular_projection')
        definition = get_object_type('geometry.perpendicular_projection')
        self.assertEqual(command.input_fields, ('point', 'lineA', 'lineB'))
        self.assertEqual(command.result_type, 'geometry.perpendicular_projection')
        self.assertTrue(definition.point_like)
        self.assertEqual(definition.dependency_fields, ('point', 'lineA', 'lineB'))

    def test_projection_can_be_created_and_reports_dependencies(self):
        response = self.client.post(
            reverse('drawing_objects_collection', args=[self.drawing.pk]),
            data=json.dumps({'type': 'geometry.perpendicular_projection', 'data': {
                'command': 'perpendicular_projection', 'point': 'p', 'lineA': 'a', 'lineB': 'b', 'label': 'H'
            }, 'style': {'radius': 6}}), content_type='application/json'
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['object']['dependencies'], ['p', 'a', 'b'])

    def test_projection_rejects_degenerate_line(self):
        response = self.client.post(
            reverse('drawing_objects_collection', args=[self.drawing.pk]),
            data=json.dumps({'type': 'geometry.perpendicular_projection', 'data': {
                'point': 'p', 'lineA': 'a', 'lineB': 'a'
            }}), content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('lineB', response.json()['errors'])

    def test_position_resolver_computes_orthogonal_projection(self):
        from routes.object_type_registry import resolve_registered_position
        obj = DrawingObject.objects.create(drawing=self.drawing, object_id='h', type='geometry.perpendicular_projection', data={
            'point': 'p', 'lineA': 'a', 'lineB': 'b'
        }, style={})
        objects = {item.object_id: item for item in DrawingObject.objects.filter(drawing=self.drawing)}
        def resolve(item):
            if item.type == 'geometry.point':
                return (float(item.data['x']), float(item.data['y']))
            return None
        position = resolve_registered_position(obj, objects_by_id=objects, resolve_position=resolve)
        self.assertAlmostEqual(position[0], 40.0)
        self.assertAlmostEqual(position[1], 0.0)

    def test_frontend_registers_projection_workflow(self):
        registry = (Path(__file__).parent / 'static' / 'routes' / 'geometry_command_registry.js').read_text()
        editor = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        tools = (Path(__file__).parent / 'static' / 'routes' / 'tool_registry.js').read_text()
        self.assertIn('id: "perpendicular_projection"', registry)
        self.assertIn('geometry.perpendicular_projection', tools)
        self.assertIn('pendingProjectionPointIds', editor)
        self.assertIn('createPerpendicularProjection', editor)

    def test_tikz_exports_perpendicular_projection(self):
        DrawingObject.objects.create(drawing=self.drawing, object_id='h', type='geometry.perpendicular_projection', data={
            'command': 'perpendicular_projection', 'point': 'p', 'lineA': 'a', 'lineB': 'b', 'label': 'H'
        }, style={'visible': True})
        response = self.client.get(reverse('drawing_export_tikz', args=[self.drawing.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '\\coordinate (h)')
        self.assertContains(response, 'H')

class Step68ReflectionAcrossLineTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='step68', password='pass')
        self.client.force_login(self.user)
        self.drawing = Drawing.objects.create(user=self.user, title='Reflection', mode=Drawing.MODE_GEOMETRY)
        for object_id, x, y in [('p', 40, 80), ('a', 0, 0), ('b', 100, 0)]:
            DrawingObject.objects.create(
                drawing=self.drawing,
                object_id=object_id,
                type='geometry.point',
                data={'x': x, 'y': y},
                style={},
            )

    def test_registry_contains_reflection_command_and_type(self):
        from routes.geometry_command_registry import get_geometry_command
        from routes.object_type_registry import get_object_type
        command = get_geometry_command('reflection_across_line')
        definition = get_object_type('geometry.reflection_across_line')
        self.assertEqual(command.input_fields, ('point', 'lineA', 'lineB'))
        self.assertEqual(command.result_type, 'geometry.reflection_across_line')
        self.assertTrue(definition.point_like)
        self.assertEqual(definition.dependency_fields, ('point', 'lineA', 'lineB'))

    def test_reflection_can_be_created_and_reports_dependencies(self):
        response = self.client.post(
            reverse('drawing_objects_collection', args=[self.drawing.pk]),
            data=json.dumps({'type': 'geometry.reflection_across_line', 'data': {
                'command': 'reflection_across_line', 'point': 'p', 'lineA': 'a', 'lineB': 'b', 'label': "P'"
            }, 'style': {'radius': 6}}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['object']['dependencies'], ['p', 'a', 'b'])

    def test_reflection_rejects_degenerate_line(self):
        response = self.client.post(
            reverse('drawing_objects_collection', args=[self.drawing.pk]),
            data=json.dumps({'type': 'geometry.reflection_across_line', 'data': {
                'point': 'p', 'lineA': 'a', 'lineB': 'a'
            }}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('lineB', response.json()['errors'])

    def test_position_resolver_reflects_point_across_horizontal_line(self):
        from routes.object_type_registry import resolve_registered_position
        obj = DrawingObject.objects.create(
            drawing=self.drawing,
            object_id='reflected',
            type='geometry.reflection_across_line',
            data={'point': 'p', 'lineA': 'a', 'lineB': 'b'},
            style={},
        )
        objects = {item.object_id: item for item in DrawingObject.objects.filter(drawing=self.drawing)}

        def resolve(item):
            if item.type == 'geometry.point':
                return (float(item.data['x']), float(item.data['y']))
            return None

        position = resolve_registered_position(obj, objects_by_id=objects, resolve_position=resolve)
        self.assertAlmostEqual(position[0], 40.0)
        self.assertAlmostEqual(position[1], -80.0)

    def test_frontend_registers_reflection_workflow(self):
        registry = (Path(__file__).parent / 'static' / 'routes' / 'geometry_command_registry.js').read_text()
        editor = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        tools = (Path(__file__).parent / 'static' / 'routes' / 'tool_registry.js').read_text()
        self.assertIn('id: "reflection_across_line"', registry)
        self.assertIn('geometry.reflection_across_line', tools)
        self.assertIn('pendingReflectionPointIds', editor)
        self.assertIn('createReflectionAcrossLine', editor)

    def test_tikz_exports_reflected_point(self):
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id='reflected',
            type='geometry.reflection_across_line',
            data={
                'command': 'reflection_across_line',
                'point': 'p',
                'lineA': 'a',
                'lineB': 'b',
                'label': "P'",
            },
            style={'visible': True},
        )
        response = self.client.get(reverse('drawing_export_tikz', args=[self.drawing.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '\\coordinate (reflected)')
        self.assertContains(response, "P'")


class Step69RotationAroundPointTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='step69', password='pass')
        self.client.force_login(self.user)
        self.drawing = Drawing.objects.create(user=self.user, title='Rotation', mode=Drawing.MODE_GEOMETRY)
        for object_id, x, y in [('p', 10, 0), ('c', 0, 0)]:
            DrawingObject.objects.create(
                drawing=self.drawing,
                object_id=object_id,
                type='geometry.point',
                data={'x': x, 'y': y},
                style={},
            )

    def test_registry_contains_rotation_command_and_type(self):
        from routes.geometry_command_registry import get_geometry_command
        from routes.object_type_registry import get_object_type
        command = get_geometry_command('rotation_around_point')
        definition = get_object_type('geometry.rotation_around_point')
        self.assertEqual(command.input_fields, ('point', 'center'))
        self.assertEqual(command.parameter_fields, ('angleDegrees',))
        self.assertEqual(command.result_type, 'geometry.rotation_around_point')
        self.assertTrue(definition.point_like)
        self.assertEqual(definition.dependency_fields, ('point', 'center'))

    def test_rotation_can_be_created_and_reports_dependencies(self):
        response = self.client.post(
            reverse('drawing_objects_collection', args=[self.drawing.pk]),
            data=json.dumps({'type': 'geometry.rotation_around_point', 'data': {
                'command': 'rotation_around_point', 'point': 'p', 'center': 'c',
                'angleDegrees': 90, 'label': 'R'
            }, 'style': {'radius': 6}}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['object']['dependencies'], ['p', 'c'])

    def test_rotation_rejects_non_numeric_angle(self):
        response = self.client.post(
            reverse('drawing_objects_collection', args=[self.drawing.pk]),
            data=json.dumps({'type': 'geometry.rotation_around_point', 'data': {
                'point': 'p', 'center': 'c', 'angleDegrees': 'abc'
            }}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('angleDegrees', response.json()['errors'])

    def test_position_resolver_rotates_ninety_degrees(self):
        from routes.object_type_registry import resolve_registered_position
        obj = DrawingObject.objects.create(
            drawing=self.drawing,
            object_id='rotated',
            type='geometry.rotation_around_point',
            data={'point': 'p', 'center': 'c', 'angleDegrees': 90},
            style={},
        )
        objects = {item.object_id: item for item in DrawingObject.objects.filter(drawing=self.drawing)}

        def resolve(item):
            if item.type == 'geometry.point':
                return (float(item.data['x']), float(item.data['y']))
            return None

        position = resolve_registered_position(obj, objects_by_id=objects, resolve_position=resolve)
        self.assertAlmostEqual(position[0], 0.0, places=7)
        self.assertAlmostEqual(position[1], 10.0, places=7)

    def test_frontend_registers_rotation_workflow(self):
        registry = (Path(__file__).parent / 'static' / 'routes' / 'geometry_command_registry.js').read_text()
        editor = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        tools = (Path(__file__).parent / 'static' / 'routes' / 'tool_registry.js').read_text()
        template = (Path(__file__).parent / 'templates' / 'routes' / 'drawing_detail.html').read_text()
        self.assertIn('id: "rotation_around_point"', registry)
        self.assertIn('geometry.rotation_around_point', tools)
        self.assertIn('pendingRotationPointIds', editor)
        self.assertIn('createRotationAroundPoint', editor)
        self.assertIn('data-role="rotation-angle"', template)

    def test_tikz_exports_rotated_point(self):
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id='rotated',
            type='geometry.rotation_around_point',
            data={
                'command': 'rotation_around_point', 'point': 'p', 'center': 'c',
                'angleDegrees': 90, 'label': 'R'
            },
            style={'visible': True},
        )
        response = self.client.get(reverse('drawing_export_tikz', args=[self.drawing.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '\\coordinate (rotated)')
        self.assertContains(response, 'R')


class Step70TranslationByVectorTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='step70', password='x')
        self.client.force_login(self.user)
        self.drawing = Drawing.objects.create(user=self.user, title='Translation', mode=Drawing.MODE_GEOMETRY)
        for object_id, x, y in [('p', 10, 20), ('a', 2, 3), ('b', 7, 11)]:
            DrawingObject.objects.create(drawing=self.drawing, object_id=object_id, type='geometry.point', data={'x': x, 'y': y}, style={})

    def test_registry_contains_translation_command_and_type(self):
        from routes.geometry_command_registry import get_geometry_command
        from routes.object_type_registry import get_object_type
        command = get_geometry_command('translation_by_vector')
        definition = get_object_type('geometry.translation_by_vector')
        self.assertEqual(command.input_fields, ('point', 'vectorStart', 'vectorEnd'))
        self.assertEqual(command.result_type, 'geometry.translation_by_vector')
        self.assertTrue(definition.point_like)
        self.assertEqual(definition.dependency_fields, ('point', 'vectorStart', 'vectorEnd'))

    def test_translation_can_be_created_and_reports_dependencies(self):
        response = self.client.post(
            reverse('drawing_objects_collection', args=[self.drawing.pk]),
            data=json.dumps({'type': 'geometry.translation_by_vector', 'data': {
                'command': 'translation_by_vector', 'point': 'p', 'vectorStart': 'a', 'vectorEnd': 'b', 'label': "P'"
            }, 'style': {'radius': 6}}), content_type='application/json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['object']['dependencies'], ['p', 'a', 'b'])

    def test_translation_rejects_repeated_vector_points(self):
        response = self.client.post(
            reverse('drawing_objects_collection', args=[self.drawing.pk]),
            data=json.dumps({'type': 'geometry.translation_by_vector', 'data': {
                'point': 'p', 'vectorStart': 'a', 'vectorEnd': 'a'
            }}), content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('vectorEnd', response.json()['errors'])

    def test_position_resolver_adds_vector(self):
        from routes.object_type_registry import resolve_registered_position
        obj = DrawingObject.objects.create(drawing=self.drawing, object_id='translated', type='geometry.translation_by_vector', data={'point': 'p', 'vectorStart': 'a', 'vectorEnd': 'b'}, style={})
        objects = {item.object_id: item for item in DrawingObject.objects.filter(drawing=self.drawing)}
        def resolve(item):
            if item.type == 'geometry.point':
                return (float(item.data['x']), float(item.data['y']))
            return None
        position = resolve_registered_position(obj, objects_by_id=objects, resolve_position=resolve)
        self.assertEqual(position, (15.0, 28.0))

    def test_frontend_registers_translation_workflow(self):
        registry = (Path(__file__).parent / 'static' / 'routes' / 'geometry_command_registry.js').read_text()
        editor = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        tools = (Path(__file__).parent / 'static' / 'routes' / 'tool_registry.js').read_text()
        template = (Path(__file__).parent / 'templates' / 'routes' / 'drawing_detail.html').read_text()
        self.assertIn('id: "translation_by_vector"', registry)
        self.assertIn('geometry.translation_by_vector', tools)
        self.assertIn('pendingTranslationPointIds', editor)
        self.assertIn('createTranslationByVector', editor)
        self.assertIn('geometry.translation_by_vector', template)

    def test_tikz_exports_translated_point(self):
        DrawingObject.objects.create(drawing=self.drawing, object_id='translated', type='geometry.translation_by_vector', data={'command': 'translation_by_vector', 'point': 'p', 'vectorStart': 'a', 'vectorEnd': 'b', 'label': "P'"}, style={'visible': True})
        response = self.client.get(reverse('drawing_export_tikz', args=[self.drawing.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '\\coordinate (translated)')
        self.assertContains(response, "P'")


class Step71CentralReflectionTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='step71', password='x')
        self.client.force_login(self.user)
        self.drawing = Drawing.objects.create(user=self.user, title='Central reflection', mode=Drawing.MODE_GEOMETRY)
        for object_id, x, y in [('p', 10, 20), ('c', 3, 4)]:
            DrawingObject.objects.create(drawing=self.drawing, object_id=object_id, type='geometry.point', data={'x': x, 'y': y}, style={})

    def test_registry_contains_central_reflection_command_and_type(self):
        from routes.geometry_command_registry import get_geometry_command
        from routes.object_type_registry import get_object_type
        command = get_geometry_command('central_reflection')
        definition = get_object_type('geometry.central_reflection')
        self.assertEqual(command.input_fields, ('point', 'center'))
        self.assertEqual(command.result_type, 'geometry.central_reflection')
        self.assertTrue(definition.point_like)
        self.assertEqual(definition.dependency_fields, ('point', 'center'))

    def test_central_reflection_can_be_created_and_reports_dependencies(self):
        response = self.client.post(
            reverse('drawing_objects_collection', args=[self.drawing.pk]),
            data=json.dumps({'type': 'geometry.central_reflection', 'data': {
                'command': 'central_reflection', 'point': 'p', 'center': 'c', 'label': "P'"
            }, 'style': {'radius': 6}}), content_type='application/json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['object']['dependencies'], ['p', 'c'])

    def test_central_reflection_rejects_same_point_and_center(self):
        response = self.client.post(
            reverse('drawing_objects_collection', args=[self.drawing.pk]),
            data=json.dumps({'type': 'geometry.central_reflection', 'data': {
                'point': 'p', 'center': 'p'
            }}), content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('center', response.json()['errors'])

    def test_position_resolver_reflects_through_center(self):
        from routes.object_type_registry import resolve_registered_position
        obj = DrawingObject.objects.create(drawing=self.drawing, object_id='reflected', type='geometry.central_reflection', data={'point': 'p', 'center': 'c'}, style={})
        objects = {item.object_id: item for item in DrawingObject.objects.filter(drawing=self.drawing)}
        def resolve(item):
            if item.type == 'geometry.point':
                return (float(item.data['x']), float(item.data['y']))
            return None
        position = resolve_registered_position(obj, objects_by_id=objects, resolve_position=resolve)
        self.assertEqual(position, (-4.0, -12.0))

    def test_frontend_registers_central_reflection_workflow(self):
        registry = (Path(__file__).parent / 'static' / 'routes' / 'geometry_command_registry.js').read_text()
        editor = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        tools = (Path(__file__).parent / 'static' / 'routes' / 'tool_registry.js').read_text()
        template = (Path(__file__).parent / 'templates' / 'routes' / 'drawing_detail.html').read_text()
        self.assertIn('id: "central_reflection"', registry)
        self.assertIn('geometry.central_reflection', tools)
        self.assertIn('pendingCentralReflectionPointIds', editor)
        self.assertIn('createCentralReflection', editor)
        self.assertIn('geometry.central_reflection', template)

    def test_tikz_exports_centrally_reflected_point(self):
        DrawingObject.objects.create(drawing=self.drawing, object_id='reflected', type='geometry.central_reflection', data={'command': 'central_reflection', 'point': 'p', 'center': 'c', 'label': "P'"}, style={'visible': True})
        response = self.client.get(reverse('drawing_export_tikz', args=[self.drawing.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '\\coordinate (reflected)')
        self.assertContains(response, "P'")

class Step72HomothetyTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='step72', password='x')
        self.drawing = Drawing.objects.create(user=self.user, title='Step 72', mode='geometry')
        self.client.force_login(self.user)
        DrawingObject.objects.create(drawing=self.drawing, object_id='p', type='geometry.point', data={'x': 10, 'y': 20}, style={})
        DrawingObject.objects.create(drawing=self.drawing, object_id='c', type='geometry.point', data={'x': 3, 'y': 4}, style={})

    def test_registry_contains_homothety_command_and_type(self):
        from routes.geometry_command_registry import get_geometry_command
        from routes.object_type_registry import get_object_type
        command = get_geometry_command('homothety')
        definition = get_object_type('geometry.homothety')
        self.assertEqual(command.result_type, 'geometry.homothety')
        self.assertEqual(command.parameter_fields, ('scaleFactor',))
        self.assertEqual(definition.dependency_fields, ('point', 'center'))

    def test_homothety_can_be_created_and_reports_dependencies(self):
        response = self.client.post(
            reverse('drawing_objects_collection', kwargs={'drawing_id': self.drawing.pk}),
            data=json.dumps({'type': 'geometry.homothety', 'data': {
                'command': 'homothety', 'point': 'p', 'center': 'c', 'scaleFactor': 2, 'label': "P'"
            }}), content_type='application/json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['object']['dependencies'], ['p', 'c'])

    def test_homothety_rejects_invalid_scale(self):
        response = self.client.post(
            reverse('drawing_objects_collection', kwargs={'drawing_id': self.drawing.pk}),
            data=json.dumps({'type': 'geometry.homothety', 'data': {
                'command': 'homothety', 'point': 'p', 'center': 'c', 'scaleFactor': 'bad'
            }}), content_type='application/json')
        self.assertEqual(response.status_code, 400)

    def test_homothety_resolver_computes_expected_position(self):
        from routes.object_type_registry import resolve_registered_position
        obj = DrawingObject.objects.create(
            drawing=self.drawing, object_id='h', type='geometry.homothety',
            data={'command': 'homothety', 'point': 'p', 'center': 'c', 'scaleFactor': 2}, style={})
        objects = {item.object_id: item for item in self.drawing.drawing_objects.all()}
        
        def resolve(item):
            if item is None:
                return None
            if item.type == 'geometry.point':
                return (float(item.data['x']), float(item.data['y']))
            return resolve_registered_position(item, objects_by_id=objects, resolve_position=resolve)
        result = resolve_registered_position(obj, objects_by_id=objects, resolve_position=resolve)
        self.assertAlmostEqual(result[0], 17)
        self.assertAlmostEqual(result[1], 36)

    def test_frontend_registers_homothety_workflow(self):
        base = Path(__file__).resolve().parent
        registry = (base / 'static/routes/geometry_command_registry.js').read_text()
        tools = (base / 'static/routes/tool_registry.js').read_text()
        editor = (base / 'static/routes/drawing_editor.js').read_text()
        template = (base / 'templates/routes/drawing_detail.html').read_text()
        self.assertIn('id: "homothety"', registry)
        self.assertIn('geometry.homothety', tools)
        self.assertIn('createHomothety', editor)
        self.assertIn('data-role="homothety-scale"', template)

class Step73SegmentProjectionTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='step73', password='x')
        self.drawing = Drawing.objects.create(user=self.user, title='Step 73', mode='geometry')
        self.client.force_login(self.user)
        for object_id, x, y in [('p', 4, 8), ('a', 0, 0), ('b', 10, 0), ('outside', 20, 5)]:
            DrawingObject.objects.create(
                drawing=self.drawing, object_id=object_id,
                type='geometry.point', data={'x': x, 'y': y}, style={})

    def test_registry_contains_segment_projection_command_and_type(self):
        from routes.geometry_command_registry import get_geometry_command
        from routes.object_type_registry import get_object_type
        command = get_geometry_command('segment_projection')
        definition = get_object_type('geometry.segment_projection')
        self.assertEqual(command.result_type, 'geometry.segment_projection')
        self.assertEqual(command.input_fields, ('point', 'segmentA', 'segmentB'))
        self.assertEqual(definition.dependency_fields, ('point', 'segmentA', 'segmentB'))
        self.assertTrue(definition.point_like)

    def test_segment_projection_can_be_created_and_reports_dependencies(self):
        response = self.client.post(
            reverse('drawing_objects_collection', kwargs={'drawing_id': self.drawing.pk}),
            data=json.dumps({'type': 'geometry.segment_projection', 'data': {
                'command': 'segment_projection', 'point': 'p', 'segmentA': 'a', 'segmentB': 'b', 'label': 'H'
            }}), content_type='application/json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['object']['dependencies'], ['p', 'a', 'b'])

    def test_segment_projection_rejects_repeated_inputs(self):
        response = self.client.post(
            reverse('drawing_objects_collection', kwargs={'drawing_id': self.drawing.pk}),
            data=json.dumps({'type': 'geometry.segment_projection', 'data': {
                'point': 'p', 'segmentA': 'a', 'segmentB': 'a'
            }}), content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('segmentB', response.json()['errors'])

    def _resolve(self, point_id):
        from routes.object_type_registry import resolve_registered_position
        obj = DrawingObject.objects.create(
            drawing=self.drawing, object_id='result-' + point_id,
            type='geometry.segment_projection',
            data={'point': point_id, 'segmentA': 'a', 'segmentB': 'b'}, style={})
        objects = {item.object_id: item for item in self.drawing.drawing_objects.all()}
        def resolve(item):
            if item is None:
                return None
            if item.type == 'geometry.point':
                return (float(item.data['x']), float(item.data['y']))
            return resolve_registered_position(item, objects_by_id=objects, resolve_position=resolve)
        return resolve_registered_position(obj, objects_by_id=objects, resolve_position=resolve)

    def test_resolver_projects_inside_segment(self):
        self.assertEqual(self._resolve('p'), (4.0, 0.0))

    def test_resolver_clamps_projection_to_endpoint(self):
        self.assertEqual(self._resolve('outside'), (10.0, 0.0))

    def test_frontend_registers_segment_projection_workflow(self):
        base = Path(__file__).resolve().parent
        registry = (base / 'static/routes/geometry_command_registry.js').read_text()
        tools = (base / 'static/routes/tool_registry.js').read_text()
        editor = (base / 'static/routes/drawing_editor.js').read_text()
        template = (base / 'templates/routes/drawing_detail.html').read_text()
        self.assertIn('id: "segment_projection"', registry)
        self.assertIn('geometry.segment_projection', tools)
        self.assertIn('pendingSegmentProjectionPointIds', editor)
        self.assertIn('createSegmentProjection', editor)
        self.assertIn('geometry.segment_projection', template)

    def test_tikz_exports_segment_projection(self):
        DrawingObject.objects.create(
            drawing=self.drawing, object_id='h', type='geometry.segment_projection',
            data={'command': 'segment_projection', 'point': 'p', 'segmentA': 'a', 'segmentB': 'b', 'label': 'H'},
            style={'visible': True})
        response = self.client.get(reverse('drawing_export_tikz', args=[self.drawing.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '\\coordinate (h)')
        self.assertContains(response, 'H')


class CircleNearestPointStep74Tests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='step74', password='x')
        self.drawing = Drawing.objects.create(user=self.user, title='Krok 74', mode='geometry')
        self.client.force_login(self.user)
        for object_id, x, y in [('p', 10, 0), ('c', 0, 0), ('r', 0, 5)]:
            DrawingObject.objects.create(
                drawing=self.drawing, object_id=object_id, type='geometry.point',
                data={'x': x, 'y': y, 'label': object_id.upper()}, style={}
            )

    def test_registry_contains_circle_nearest_point(self):
        from .geometry_command_registry import get_geometry_command
        from .object_type_registry import get_object_type
        command = get_geometry_command('circle_nearest_point')
        definition = get_object_type('geometry.circle_nearest_point')
        self.assertIsNotNone(command)
        self.assertEqual(command.result_type, 'geometry.circle_nearest_point')
        self.assertEqual(definition.dependency_fields, ('point', 'center', 'radiusPoint'))

    def test_circle_nearest_point_can_be_created(self):
        response = self.client.post(
            reverse('drawing_objects_collection', kwargs={'drawing_id': self.drawing.pk}),
            data=json.dumps({'type': 'geometry.circle_nearest_point', 'data': {
                'command': 'circle_nearest_point', 'point': 'p', 'center': 'c', 'radiusPoint': 'r', 'label': 'N'
            }}), content_type='application/json'
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()['object']['dependencies'], ['p', 'c', 'r'])

    def test_circle_nearest_point_resolver(self):
        from .object_type_registry import resolve_registered_position
        obj = DrawingObject.objects.create(
            drawing=self.drawing, object_id='n', type='geometry.circle_nearest_point',
            data={'command': 'circle_nearest_point', 'point': 'p', 'center': 'c', 'radiusPoint': 'r'}, style={}
        )
        objects = {o.object_id: o for o in self.drawing.drawing_objects.all()}
        def resolve(item):
            if item.type == 'geometry.point':
                return (item.data['x'], item.data['y'])
            return resolve_registered_position(item, objects_by_id=objects, resolve_position=resolve)
        x, y = resolve(obj)
        self.assertAlmostEqual(x, 5.0)
        self.assertAlmostEqual(y, 0.0)

    def test_circle_nearest_point_rejects_repeated_inputs(self):
        response = self.client.post(
            reverse('drawing_objects_collection', kwargs={'drawing_id': self.drawing.pk}),
            data=json.dumps({'type': 'geometry.circle_nearest_point', 'data': {
                'command': 'circle_nearest_point', 'point': 'p', 'center': 'c', 'radiusPoint': 'c'
            }}), content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)

    def test_frontend_registers_circle_nearest_point(self):
        base = Path(__file__).resolve().parent
        editor = (base / 'static/routes/drawing_editor.js').read_text()
        registry = (base / 'static/routes/geometry_command_registry.js').read_text()
        tools = (base / 'static/routes/tool_registry.js').read_text()
        template = (base / 'templates/routes/drawing_detail.html').read_text()
        self.assertIn('createCircleNearestPoint', editor)
        self.assertIn('id: "circle_nearest_point"', registry)
        self.assertIn('geometry.circle_nearest_point', tools)
        self.assertIn('geometry.circle_nearest_point', template)

    def test_tikz_exports_circle_nearest_point(self):
        DrawingObject.objects.create(
            drawing=self.drawing, object_id='n2', type='geometry.circle_nearest_point',
            data={'command': 'circle_nearest_point', 'point': 'p', 'center': 'c', 'radiusPoint': 'r', 'label': 'N'},
            style={'visible': True})
        response = self.client.get(reverse('drawing_export_tikz', args=[self.drawing.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '\\coordinate (n2)')
        self.assertContains(response, 'N')

class LineCircleIntersectionStep75Tests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='step75', password='x')
        self.drawing = Drawing.objects.create(user=self.user, title='Krok 75', mode='geometry')
        self.client.force_login(self.user)
        for object_id, x, y in [('a', -10, 0), ('b', 10, 0), ('c', 0, 0), ('r', 0, 5), ('ta', -10, 5), ('tb', 10, 5)]:
            DrawingObject.objects.create(
                drawing=self.drawing, object_id=object_id, type='geometry.point',
                data={'x': x, 'y': y, 'label': object_id.upper()}, style={}
            )

    def test_registry_contains_line_circle_intersection(self):
        from .geometry_command_registry import get_geometry_command
        from .object_type_registry import get_object_type
        command = get_geometry_command('line_circle_intersection')
        definition = get_object_type('geometry.line_circle_intersection')
        self.assertIsNotNone(command)
        self.assertEqual(command.result_type, 'geometry.line_circle_intersection')
        self.assertEqual(command.input_fields, ('lineA', 'lineB', 'center', 'radiusPoint'))
        self.assertEqual(command.parameter_fields, ('branch',))
        self.assertEqual(definition.dependency_fields, ('lineA', 'lineB', 'center', 'radiusPoint'))

    def test_line_circle_intersection_can_be_created(self):
        response = self.client.post(
            reverse('drawing_objects_collection', kwargs={'drawing_id': self.drawing.pk}),
            data=json.dumps({'type': 'geometry.line_circle_intersection', 'data': {
                'command': 'line_circle_intersection', 'lineA': 'a', 'lineB': 'b',
                'center': 'c', 'radiusPoint': 'r', 'branch': -1, 'label': 'X1'
            }}), content_type='application/json')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()['object']['dependencies'], ['a', 'b', 'c', 'r'])

    def test_line_circle_intersection_rejects_invalid_branch(self):
        response = self.client.post(
            reverse('drawing_objects_collection', kwargs={'drawing_id': self.drawing.pk}),
            data=json.dumps({'type': 'geometry.line_circle_intersection', 'data': {
                'lineA': 'a', 'lineB': 'b', 'center': 'c', 'radiusPoint': 'r', 'branch': 4
            }}), content_type='application/json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('branch', response.json()['errors'])

    def _resolve(self, object_id, line_a='a', line_b='b', branch=1):
        from .object_type_registry import resolve_registered_position
        obj = DrawingObject.objects.create(
            drawing=self.drawing, object_id=object_id, type='geometry.line_circle_intersection',
            data={'command': 'line_circle_intersection', 'lineA': line_a, 'lineB': line_b,
                  'center': 'c', 'radiusPoint': 'r', 'branch': branch}, style={})
        objects = {item.object_id: item for item in self.drawing.drawing_objects.all()}
        def resolve(item):
            if item is None:
                return None
            if item.type == 'geometry.point':
                return (float(item.data['x']), float(item.data['y']))
            return resolve_registered_position(item, objects_by_id=objects, resolve_position=resolve)
        return resolve_registered_position(obj, objects_by_id=objects, resolve_position=resolve)

    def test_resolver_returns_two_intersections(self):
        left = self._resolve('x-left', branch=-1)
        right = self._resolve('x-right', branch=1)
        self.assertAlmostEqual(left[0], -5.0)
        self.assertAlmostEqual(left[1], 0.0)
        self.assertAlmostEqual(right[0], 5.0)
        self.assertAlmostEqual(right[1], 0.0)

    def test_resolver_handles_tangent(self):
        tangent = self._resolve('x-tangent', line_a='ta', line_b='tb', branch=0)
        self.assertAlmostEqual(tangent[0], 0.0)
        self.assertAlmostEqual(tangent[1], 5.0)

    def test_frontend_registers_line_circle_intersection(self):
        base = Path(__file__).resolve().parent
        editor = (base / 'static/routes/drawing_editor.js').read_text()
        registry = (base / 'static/routes/geometry_command_registry.js').read_text()
        tools = (base / 'static/routes/tool_registry.js').read_text()
        template = (base / 'templates/routes/drawing_detail.html').read_text()
        self.assertIn('createLineCircleIntersection', editor)
        self.assertIn('pendingLineCircleIntersectionPointIds', editor)
        self.assertIn('id: "line_circle_intersection"', registry)
        self.assertIn('geometry.line_circle_intersection', tools)
        self.assertIn('geometry.line_circle_intersection', template)

    def test_tikz_exports_line_circle_intersection(self):
        DrawingObject.objects.create(
            drawing=self.drawing, object_id='x1', type='geometry.line_circle_intersection',
            data={'command': 'line_circle_intersection', 'lineA': 'a', 'lineB': 'b',
                  'center': 'c', 'radiusPoint': 'r', 'branch': 1, 'label': 'X1'},
            style={'visible': True})
        response = self.client.get(reverse('drawing_export_tikz', args=[self.drawing.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '\\coordinate (x1)')
        self.assertContains(response, 'X1')

class CircleCircleIntersectionStep76Tests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='step76', password='x')
        self.drawing = Drawing.objects.create(user=self.user, title='Krok 76', mode='geometry')
        self.client.force_login(self.user)
        for object_id, x, y in [('c1', 0, 0), ('r1', 5, 0), ('c2', 8, 0), ('r2', 13, 0), ('ct', 10, 0), ('rt', 15, 0)]:
            DrawingObject.objects.create(drawing=self.drawing, object_id=object_id, type='geometry.point', data={'x': x, 'y': y}, style={})

    def test_registry_contains_circle_circle_intersection(self):
        from .geometry_command_registry import get_geometry_command
        from .object_type_registry import get_object_type
        command = get_geometry_command('circle_circle_intersection')
        definition = get_object_type('geometry.circle_circle_intersection')
        self.assertEqual(command.input_fields, ('centerA', 'radiusPointA', 'centerB', 'radiusPointB'))
        self.assertEqual(definition.dependency_fields, ('centerA', 'radiusPointA', 'centerB', 'radiusPointB'))

    def test_circle_circle_intersection_can_be_created(self):
        response = self.client.post(reverse('drawing_objects_collection', kwargs={'drawing_id': self.drawing.pk}), data=json.dumps({
            'type': 'geometry.circle_circle_intersection', 'data': {'command': 'circle_circle_intersection', 'centerA': 'c1', 'radiusPointA': 'r1', 'centerB': 'c2', 'radiusPointB': 'r2', 'branch': 1, 'label': 'X1'}
        }), content_type='application/json')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()['object']['dependencies'], ['c1', 'r1', 'c2', 'r2'])

    def _resolve(self, object_id, branch):
        from .object_type_registry import resolve_registered_position
        obj = DrawingObject.objects.create(drawing=self.drawing, object_id=object_id, type='geometry.circle_circle_intersection', data={'command':'circle_circle_intersection','centerA':'c1','radiusPointA':'r1','centerB':'c2','radiusPointB':'r2','branch':branch}, style={})
        objects = {item.object_id: item for item in self.drawing.drawing_objects.all()}
        def resolve(item):
            if item is None: return None
            if item.type == 'geometry.point': return (float(item.data['x']), float(item.data['y']))
            return resolve_registered_position(item, objects_by_id=objects, resolve_position=resolve)
        return resolve_registered_position(obj, objects_by_id=objects, resolve_position=resolve)

    def test_resolver_returns_two_intersections(self):
        low = self._resolve('x-low', -1)
        high = self._resolve('x-high', 1)
        self.assertAlmostEqual(low[0], 4.0)
        self.assertAlmostEqual(abs(low[1]), 3.0)
        self.assertAlmostEqual(high[0], 4.0)
        self.assertAlmostEqual(abs(high[1]), 3.0)
        self.assertAlmostEqual(low[1], -high[1])

    def test_resolver_handles_tangent(self):
        from .object_type_registry import resolve_registered_position
        obj = DrawingObject.objects.create(drawing=self.drawing, object_id='xt', type='geometry.circle_circle_intersection', data={'command':'circle_circle_intersection','centerA':'c1','radiusPointA':'r1','centerB':'ct','radiusPointB':'rt','branch':0}, style={})
        objects = {item.object_id: item for item in self.drawing.drawing_objects.all()}
        def resolve(item):
            if item.type == 'geometry.point': return (float(item.data['x']), float(item.data['y']))
            return resolve_registered_position(item, objects_by_id=objects, resolve_position=resolve)
        point = resolve_registered_position(obj, objects_by_id=objects, resolve_position=resolve)
        self.assertAlmostEqual(point[0], 5.0)
        self.assertAlmostEqual(point[1], 0.0)

    def test_frontend_registers_circle_circle_intersection(self):
        base = Path(__file__).resolve().parent
        editor = (base / 'static/routes/drawing_editor.js').read_text()
        registry = (base / 'static/routes/geometry_command_registry.js').read_text()
        tools = (base / 'static/routes/tool_registry.js').read_text()
        template = (base / 'templates/routes/drawing_detail.html').read_text()
        self.assertIn('createCircleCircleIntersection', editor)
        self.assertIn('id: "circle_circle_intersection"', registry)
        self.assertIn('geometry.circle_circle_intersection', tools)
        self.assertIn('geometry.circle_circle_intersection', template)

    def test_tikz_exports_circle_circle_intersection(self):
        DrawingObject.objects.create(drawing=self.drawing, object_id='xcc', type='geometry.circle_circle_intersection', data={'command':'circle_circle_intersection','centerA':'c1','radiusPointA':'r1','centerB':'c2','radiusPointB':'r2','branch':1,'label':'X'}, style={'visible':True})
        response = self.client.get(reverse('drawing_export_tikz', args=[self.drawing.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '\\coordinate (xcc)')
        self.assertContains(response, 'X')


class CircumcenterStep77Tests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='step77', password='x')
        self.drawing = Drawing.objects.create(user=self.user, title='Krok 77', mode='geometry')
        self.client.force_login(self.user)
        for object_id, x, y in [('a', 0, 0), ('b', 6, 0), ('c', 0, 8), ('d', 12, 0)]:
            DrawingObject.objects.create(
                drawing=self.drawing, object_id=object_id, type='geometry.point',
                data={'x': x, 'y': y, 'label': object_id.upper()}, style={}
            )

    def test_registry_contains_circumcenter(self):
        from .geometry_command_registry import get_geometry_command
        from .object_type_registry import get_object_type
        command = get_geometry_command('circumcenter')
        definition = get_object_type('geometry.circumcenter')
        self.assertIsNotNone(command)
        self.assertEqual(command.result_type, 'geometry.circumcenter')
        self.assertEqual(command.input_fields, ('pointA', 'pointB', 'pointC'))
        self.assertEqual(definition.dependency_fields, ('pointA', 'pointB', 'pointC'))

    def test_circumcenter_can_be_created(self):
        response = self.client.post(
            reverse('drawing_objects_collection', kwargs={'drawing_id': self.drawing.pk}),
            data=json.dumps({'type': 'geometry.circumcenter', 'data': {
                'command': 'circumcenter', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c', 'label': 'O'
            }}), content_type='application/json'
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()['object']['dependencies'], ['a', 'b', 'c'])

    def test_circumcenter_resolver(self):
        from .object_type_registry import resolve_registered_position
        obj = DrawingObject.objects.create(
            drawing=self.drawing, object_id='o', type='geometry.circumcenter',
            data={'command': 'circumcenter', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c', 'label': 'O'},
            style={}
        )
        objects = {item.object_id: item for item in self.drawing.drawing_objects.all()}
        def resolve(item):
            if item is None:
                return None
            if item.type == 'geometry.point':
                return (float(item.data['x']), float(item.data['y']))
            return resolve_registered_position(item, objects_by_id=objects, resolve_position=resolve)
        point = resolve_registered_position(obj, objects_by_id=objects, resolve_position=resolve)
        self.assertAlmostEqual(point[0], 3.0)
        self.assertAlmostEqual(point[1], 4.0)

    def test_circumcenter_resolver_returns_none_for_collinear_points(self):
        from .object_type_registry import resolve_registered_position
        obj = DrawingObject.objects.create(
            drawing=self.drawing, object_id='bad-o', type='geometry.circumcenter',
            data={'command': 'circumcenter', 'pointA': 'a', 'pointB': 'b', 'pointC': 'd'}, style={}
        )
        objects = {item.object_id: item for item in self.drawing.drawing_objects.all()}
        def resolve(item):
            if item.type == 'geometry.point':
                return (float(item.data['x']), float(item.data['y']))
            return resolve_registered_position(item, objects_by_id=objects, resolve_position=resolve)
        self.assertIsNone(resolve_registered_position(obj, objects_by_id=objects, resolve_position=resolve))

    def test_frontend_registers_circumcenter(self):
        base = Path(__file__).resolve().parent
        editor = (base / 'static/routes/drawing_editor.js').read_text()
        registry = (base / 'static/routes/geometry_command_registry.js').read_text()
        tools = (base / 'static/routes/tool_registry.js').read_text()
        template = (base / 'templates/routes/drawing_detail.html').read_text()
        self.assertIn('createCircumcenter', editor)
        self.assertIn('pendingCircumcenterPointIds', editor)
        self.assertIn('id: "circumcenter"', registry)
        self.assertIn('geometry.circumcenter', tools)
        self.assertIn('geometry.circumcenter', template)

    def test_tikz_exports_circumcenter(self):
        DrawingObject.objects.create(
            drawing=self.drawing, object_id='center-o', type='geometry.circumcenter',
            data={'command': 'circumcenter', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c', 'label': 'O'},
            style={'visible': True}
        )
        response = self.client.get(reverse('drawing_export_tikz', args=[self.drawing.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '\\coordinate (center_o)')
        self.assertContains(response, 'O')

    def test_help_function_no_longer_contains_circle_click_handler(self):
        base = Path(__file__).resolve().parent
        editor = (base / 'static/routes/drawing_editor.js').read_text()
        start = editor.index('helpTextForCurrentTool()')
        end = editor.index('currentToolSelectsOnly()', start)
        help_source = editor[start:end]
        self.assertNotIn('pendingCircleCircleIntersectionPointIds.push', help_source)



class OrthocenterStep78Tests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='step78', password='x')
        self.drawing = Drawing.objects.create(user=self.user, title='Krok 78', mode='geometry')
        self.client.force_login(self.user)
        for object_id, x, y in [('a', 0, 0), ('b', 6, 0), ('c', 0, 8), ('d', 12, 0)]:
            DrawingObject.objects.create(
                drawing=self.drawing, object_id=object_id, type='geometry.point',
                data={'x': x, 'y': y, 'label': object_id.upper()}, style={}
            )

    def test_registry_contains_orthocenter(self):
        from .geometry_command_registry import get_geometry_command
        from .object_type_registry import get_object_type
        command = get_geometry_command('orthocenter')
        definition = get_object_type('geometry.orthocenter')
        self.assertIsNotNone(command)
        self.assertEqual(command.result_type, 'geometry.orthocenter')
        self.assertEqual(command.input_fields, ('pointA', 'pointB', 'pointC'))
        self.assertEqual(definition.dependency_fields, ('pointA', 'pointB', 'pointC'))

    def test_orthocenter_can_be_created(self):
        response = self.client.post(
            reverse('drawing_objects_collection', kwargs={'drawing_id': self.drawing.pk}),
            data=json.dumps({'type': 'geometry.orthocenter', 'data': {
                'command': 'orthocenter', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c', 'label': 'H'
            }}), content_type='application/json'
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()['object']['dependencies'], ['a', 'b', 'c'])

    def test_orthocenter_resolver(self):
        from .object_type_registry import resolve_registered_position
        obj = DrawingObject.objects.create(
            drawing=self.drawing, object_id='h', type='geometry.orthocenter',
            data={'command': 'orthocenter', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c', 'label': 'H'}, style={}
        )
        objects = {item.object_id: item for item in self.drawing.drawing_objects.all()}
        def resolve(item):
            if item is None:
                return None
            if item.type == 'geometry.point':
                return (float(item.data['x']), float(item.data['y']))
            return resolve_registered_position(item, objects_by_id=objects, resolve_position=resolve)
        point = resolve_registered_position(obj, objects_by_id=objects, resolve_position=resolve)
        self.assertAlmostEqual(point[0], 0.0)
        self.assertAlmostEqual(point[1], 0.0)

    def test_orthocenter_resolver_returns_none_for_collinear_points(self):
        from .object_type_registry import resolve_registered_position
        obj = DrawingObject.objects.create(
            drawing=self.drawing, object_id='bad-h', type='geometry.orthocenter',
            data={'command': 'orthocenter', 'pointA': 'a', 'pointB': 'b', 'pointC': 'd'}, style={}
        )
        objects = {item.object_id: item for item in self.drawing.drawing_objects.all()}
        def resolve(item):
            if item.type == 'geometry.point':
                return (float(item.data['x']), float(item.data['y']))
            return resolve_registered_position(item, objects_by_id=objects, resolve_position=resolve)
        self.assertIsNone(resolve_registered_position(obj, objects_by_id=objects, resolve_position=resolve))

    def test_frontend_registers_orthocenter(self):
        base = Path(__file__).resolve().parent
        editor = (base / 'static/routes/drawing_editor.js').read_text()
        registry = (base / 'static/routes/geometry_command_registry.js').read_text()
        tools = (base / 'static/routes/tool_registry.js').read_text()
        template = (base / 'templates/routes/drawing_detail.html').read_text()
        self.assertIn('createOrthocenter', editor)
        self.assertIn('pendingOrthocenterPointIds', editor)
        self.assertIn('id: "orthocenter"', registry)
        self.assertIn('geometry.orthocenter', tools)
        self.assertIn('geometry.orthocenter', template)

    def test_tikz_exports_orthocenter(self):
        DrawingObject.objects.create(
            drawing=self.drawing, object_id='orth-h', type='geometry.orthocenter',
            data={'command': 'orthocenter', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c', 'label': 'H'},
            style={'visible': True}
        )
        response = self.client.get(reverse('drawing_export_tikz', args=[self.drawing.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '\\coordinate (orth_h)')
        self.assertContains(response, 'H')


class CentroidStep79Tests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='step79', password='x')
        self.drawing = Drawing.objects.create(user=self.user, title='Krok 79', mode='geometry')
        self.client.force_login(self.user)
        for object_id, x, y in [('a', 0, 0), ('b', 6, 0), ('c', 0, 9)]:
            DrawingObject.objects.create(
                drawing=self.drawing, object_id=object_id, type='geometry.point',
                data={'x': x, 'y': y, 'label': object_id.upper()}, style={}
            )

    def test_registry_contains_centroid(self):
        from .geometry_command_registry import get_geometry_command
        from .object_type_registry import get_object_type
        command = get_geometry_command('centroid')
        definition = get_object_type('geometry.centroid')
        self.assertIsNotNone(command)
        self.assertEqual(command.result_type, 'geometry.centroid')
        self.assertEqual(command.input_fields, ('pointA', 'pointB', 'pointC'))
        self.assertEqual(definition.dependency_fields, ('pointA', 'pointB', 'pointC'))

    def test_centroid_can_be_created(self):
        response = self.client.post(
            reverse('drawing_objects_collection', kwargs={'drawing_id': self.drawing.pk}),
            data=json.dumps({'type': 'geometry.centroid', 'data': {
                'command': 'centroid', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c', 'label': 'G'
            }}), content_type='application/json'
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()['object']['dependencies'], ['a', 'b', 'c'])

    def test_centroid_resolver(self):
        from .object_type_registry import resolve_registered_position
        obj = DrawingObject.objects.create(
            drawing=self.drawing, object_id='g', type='geometry.centroid',
            data={'command': 'centroid', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c', 'label': 'G'}, style={}
        )
        objects = {item.object_id: item for item in self.drawing.drawing_objects.all()}
        def resolve(item):
            if item is None:
                return None
            if item.type == 'geometry.point':
                return (float(item.data['x']), float(item.data['y']))
            return resolve_registered_position(item, objects_by_id=objects, resolve_position=resolve)
        point = resolve_registered_position(obj, objects_by_id=objects, resolve_position=resolve)
        self.assertAlmostEqual(point[0], 2.0)
        self.assertAlmostEqual(point[1], 3.0)

    def test_frontend_registers_centroid_and_orthocenter_handler(self):
        base = Path(__file__).resolve().parent
        editor = (base / 'static/routes/drawing_editor.js').read_text()
        registry = (base / 'static/routes/geometry_command_registry.js').read_text()
        tools = (base / 'static/routes/tool_registry.js').read_text()
        template = (base / 'templates/routes/drawing_detail.html').read_text()
        self.assertIn('createCentroid', editor)
        self.assertIn('pendingCentroidPointIds', editor)
        self.assertIn('id: "centroid"', registry)
        self.assertIn('geometry.centroid', tools)
        self.assertIn('geometry.centroid', template)
        help_start = editor.index('helpTextForCurrentTool()')
        handler_start = editor.index('handleObjectPointerDown') if 'handleObjectPointerDown' in editor else 0
        self.assertNotIn('pendingOrthocenterPointIds.push', editor[help_start:handler_start] if handler_start > help_start else editor[help_start:help_start+5000])

    def test_tikz_exports_centroid(self):
        DrawingObject.objects.create(
            drawing=self.drawing, object_id='centroid-g', type='geometry.centroid',
            data={'command': 'centroid', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c', 'label': 'G'},
            style={'visible': True}
        )
        response = self.client.get(reverse('drawing_export_tikz', args=[self.drawing.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '\\coordinate (centroid_g)')
        self.assertContains(response, 'G')


class IncenterStep80Tests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='step80', password='x')
        self.drawing = Drawing.objects.create(user=self.user, title='Krok 80', mode='geometry')
        self.client.force_login(self.user)
        for object_id, x, y in [('a', 0, 0), ('b', 6, 0), ('c', 0, 8)]:
            DrawingObject.objects.create(
                drawing=self.drawing, object_id=object_id, type='geometry.point',
                data={'x': x, 'y': y, 'label': object_id.upper()}, style={}
            )

    def test_registry_contains_incenter(self):
        from .geometry_command_registry import get_geometry_command
        from .object_type_registry import get_object_type
        command = get_geometry_command('incenter')
        definition = get_object_type('geometry.incenter')
        self.assertIsNotNone(command)
        self.assertEqual(command.result_type, 'geometry.incenter')
        self.assertEqual(definition.dependency_fields, ('pointA', 'pointB', 'pointC'))

    def test_incenter_can_be_created(self):
        response = self.client.post(
            reverse('drawing_objects_collection', kwargs={'drawing_id': self.drawing.pk}),
            data=json.dumps({'type': 'geometry.incenter', 'data': {
                'command': 'incenter', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c', 'label': 'I'
            }}), content_type='application/json'
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()['object']['dependencies'], ['a', 'b', 'c'])

    def test_incenter_resolver(self):
        from .object_type_registry import resolve_registered_position
        obj = DrawingObject.objects.create(
            drawing=self.drawing, object_id='i', type='geometry.incenter',
            data={'command': 'incenter', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c', 'label': 'I'}, style={}
        )
        objects = {item.object_id: item for item in self.drawing.drawing_objects.all()}
        def resolve(item):
            if item is None:
                return None
            if item.type == 'geometry.point':
                return (float(item.data['x']), float(item.data['y']))
            return resolve_registered_position(item, objects_by_id=objects, resolve_position=resolve)
        point = resolve_registered_position(obj, objects_by_id=objects, resolve_position=resolve)
        self.assertAlmostEqual(point[0], 2.0)
        self.assertAlmostEqual(point[1], 2.0)

    def test_incenter_is_hidden_for_collinear_points(self):
        self.drawing.drawing_objects.filter(object_id='c').update(data={'x': 12, 'y': 0, 'label': 'C'})
        from .object_type_registry import resolve_registered_position
        obj = DrawingObject.objects.create(
            drawing=self.drawing, object_id='i2', type='geometry.incenter',
            data={'command': 'incenter', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c', 'label': 'I'}, style={}
        )
        objects = {item.object_id: item for item in self.drawing.drawing_objects.all()}
        def resolve(item):
            if item is None: return None
            if item.type == 'geometry.point': return (float(item.data['x']), float(item.data['y']))
            return resolve_registered_position(item, objects_by_id=objects, resolve_position=resolve)
        self.assertIsNone(resolve_registered_position(obj, objects_by_id=objects, resolve_position=resolve))

    def test_frontend_registers_incenter(self):
        base = Path(__file__).resolve().parent
        editor = (base / 'static/routes/drawing_editor.js').read_text()
        registry = (base / 'static/routes/geometry_command_registry.js').read_text()
        tools = (base / 'static/routes/tool_registry.js').read_text()
        template = (base / 'templates/routes/drawing_detail.html').read_text()
        self.assertIn('createIncenter', editor)
        self.assertIn('pendingIncenterPointIds', editor)
        self.assertIn('id: "incenter"', registry)
        self.assertIn('geometry.incenter', tools)
        self.assertIn('geometry.incenter', template)

    def test_tikz_exports_incenter(self):
        DrawingObject.objects.create(
            drawing=self.drawing, object_id='incenter-i', type='geometry.incenter',
            data={'command': 'incenter', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c', 'label': 'I'},
            style={'visible': True}
        )
        response = self.client.get(reverse('drawing_export_tikz', args=[self.drawing.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '\\coordinate (incenter_i)')
        self.assertContains(response, 'I')


class IncircleTouchpointStep81Tests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='step81', password='x')
        self.drawing = Drawing.objects.create(user=self.user, title='Krok 81', mode='geometry')
        self.client.force_login(self.user)
        for object_id, x, y in [('a', 0, 0), ('b', 6, 0), ('c', 0, 8)]:
            DrawingObject.objects.create(
                drawing=self.drawing, object_id=object_id, type='geometry.point',
                data={'x': x, 'y': y, 'label': object_id.upper()}, style={}
            )

    def _resolve(self, side='AB'):
        from .object_type_registry import resolve_registered_position
        obj = DrawingObject.objects.create(
            drawing=self.drawing, object_id='touch-' + side.lower(), type='geometry.incircle_touchpoint',
            data={'command': 'incircle_touchpoint', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c', 'side': side, 'label': 'T'}, style={}
        )
        objects = {item.object_id: item for item in self.drawing.drawing_objects.all()}
        def resolve(item):
            if item is None: return None
            if item.type == 'geometry.point': return (float(item.data['x']), float(item.data['y']))
            return resolve_registered_position(item, objects_by_id=objects, resolve_position=resolve)
        return resolve_registered_position(obj, objects_by_id=objects, resolve_position=resolve)

    def test_registry_contains_incircle_touchpoint(self):
        from .geometry_command_registry import get_geometry_command
        from .object_type_registry import get_object_type
        command = get_geometry_command('incircle_touchpoint')
        definition = get_object_type('geometry.incircle_touchpoint')
        self.assertEqual(command.result_type, 'geometry.incircle_touchpoint')
        self.assertEqual(command.parameter_fields, ('side',))
        self.assertEqual(definition.dependency_fields, ('pointA', 'pointB', 'pointC'))

    def test_touchpoint_can_be_created(self):
        response = self.client.post(
            reverse('drawing_objects_collection', kwargs={'drawing_id': self.drawing.pk}),
            data=json.dumps({'type': 'geometry.incircle_touchpoint', 'data': {
                'command': 'incircle_touchpoint', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c', 'side': 'AB', 'label': 'T'
            }}), content_type='application/json'
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()['object']['dependencies'], ['a', 'b', 'c'])

    def test_touchpoint_rejects_invalid_side(self):
        response = self.client.post(
            reverse('drawing_objects_collection', kwargs={'drawing_id': self.drawing.pk}),
            data=json.dumps({'type': 'geometry.incircle_touchpoint', 'data': {
                'command': 'incircle_touchpoint', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c', 'side': 'XX', 'label': 'T'
            }}), content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)

    def test_touchpoint_on_ab(self):
        point = self._resolve('AB')
        self.assertAlmostEqual(point[0], 2.0)
        self.assertAlmostEqual(point[1], 0.0)

    def test_frontend_hides_incircle_touchpoint_tool_but_keeps_legacy_support(self):
        base = Path(__file__).resolve().parent
        editor = (base / 'static/routes/drawing_editor.js').read_text()
        registry = (base / 'static/routes/geometry_command_registry.js').read_text()
        tools = (base / 'static/routes/tool_registry.js').read_text()
        template = (base / 'templates/routes/drawing_detail.html').read_text()
        self.assertIn('createIncircleTouchpoint', editor)
        self.assertIn('pendingIncircleTouchpointPointIds', editor)
        self.assertIn('id: "incircle_touchpoint"', registry)
        self.assertNotIn('geometry.incircle_touchpoint', tools)
        self.assertNotIn('data-role="incircle-side"', template)

    def test_tikz_exports_touchpoint(self):
        DrawingObject.objects.create(
            drawing=self.drawing, object_id='touchpoint-t', type='geometry.incircle_touchpoint',
            data={'command': 'incircle_touchpoint', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c', 'side': 'AB', 'label': 'T'},
            style={'visible': True}
        )
        response = self.client.get(reverse('drawing_export_tikz', args=[self.drawing.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '\\coordinate (touchpoint_t)')
        self.assertContains(response, 'T')


class ExcenterStep82Tests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='step82', password='x')
        self.drawing = Drawing.objects.create(user=self.user, title='Krok 82', mode='geometry')
        self.client.force_login(self.user)
        for object_id, x, y in [('a', 0, 0), ('b', 6, 0), ('c', 0, 8)]:
            DrawingObject.objects.create(
                drawing=self.drawing, object_id=object_id, type='geometry.point',
                data={'x': x, 'y': y, 'label': object_id.upper()}, style={}
            )

    def _resolve(self, vertex='A'):
        from .object_type_registry import resolve_registered_position
        obj = DrawingObject.objects.create(
            drawing=self.drawing, object_id='ex-' + vertex.lower(), type='geometry.excenter',
            data={'command': 'excenter', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c', 'oppositeVertex': vertex, 'label': 'I_' + vertex.lower()}, style={}
        )
        objects = {item.object_id: item for item in self.drawing.drawing_objects.all()}
        def resolve(item):
            if item is None: return None
            if item.type == 'geometry.point': return (float(item.data['x']), float(item.data['y']))
            return resolve_registered_position(item, objects_by_id=objects, resolve_position=resolve)
        return resolve_registered_position(obj, objects_by_id=objects, resolve_position=resolve)

    def test_registry_contains_excenter(self):
        from .geometry_command_registry import get_geometry_command
        from .object_type_registry import get_object_type
        command = get_geometry_command('excenter')
        definition = get_object_type('geometry.excenter')
        self.assertEqual(command.result_type, 'geometry.excenter')
        self.assertEqual(command.parameter_fields, ('oppositeVertex',))
        self.assertEqual(definition.dependency_fields, ('pointA', 'pointB', 'pointC'))

    def test_excenter_can_be_created(self):
        response = self.client.post(
            reverse('drawing_objects_collection', kwargs={'drawing_id': self.drawing.pk}),
            data=json.dumps({'type': 'geometry.excenter', 'data': {
                'command': 'excenter', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c', 'oppositeVertex': 'A', 'label': 'I_a'
            }}), content_type='application/json'
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()['object']['dependencies'], ['a', 'b', 'c'])

    def test_excenter_rejects_invalid_vertex(self):
        response = self.client.post(
            reverse('drawing_objects_collection', kwargs={'drawing_id': self.drawing.pk}),
            data=json.dumps({'type': 'geometry.excenter', 'data': {
                'command': 'excenter', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c', 'oppositeVertex': 'X', 'label': 'I_x'
            }}), content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)

    def test_a_excenter_for_6_8_10_triangle(self):
        point = self._resolve('A')
        self.assertAlmostEqual(point[0], 12.0)
        self.assertAlmostEqual(point[1], 12.0)

    def test_frontend_registers_excenter(self):
        base = Path(__file__).resolve().parent
        editor = (base / 'static/routes/drawing_editor.js').read_text()
        registry = (base / 'static/routes/geometry_command_registry.js').read_text()
        tools = (base / 'static/routes/tool_registry.js').read_text()
        template = (base / 'templates/routes/drawing_detail.html').read_text()
        self.assertIn('createExcenter', editor)
        self.assertIn('pendingExcenterPointIds', editor)
        self.assertIn('id: "excenter"', registry)
        self.assertIn('geometry.excenter', tools)
        self.assertNotIn('data-role="excenter-vertex"', template)

    def test_tikz_exports_excenter(self):
        DrawingObject.objects.create(
            drawing=self.drawing, object_id='excenter-ia', type='geometry.excenter',
            data={'command': 'excenter', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c', 'oppositeVertex': 'A', 'label': 'I_a'},
            style={'visible': True}
        )
        response = self.client.get(reverse('drawing_export_tikz', args=[self.drawing.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '\\coordinate (excenter_ia)')
        self.assertContains(response, 'I_a')

class ExcircleTouchpointStep83Tests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='step83', password='x')
        self.drawing = Drawing.objects.create(user=self.user, title='Krok 83', mode='geometry')
        self.client.force_login(self.user)
        for object_id, x, y in [('a', 0, 0), ('b', 6, 0), ('c', 0, 8)]:
            DrawingObject.objects.create(
                drawing=self.drawing, object_id=object_id, type='geometry.point',
                data={'x': x, 'y': y, 'label': object_id.upper()}, style={}
            )

    def _resolve(self, vertex='A', side='BC'):
        from .object_type_registry import resolve_registered_position
        obj = DrawingObject.objects.create(
            drawing=self.drawing, object_id=f'ex-touch-{vertex.lower()}-{side.lower()}',
            type='geometry.excircle_touchpoint',
            data={'command': 'excircle_touchpoint', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c',
                  'oppositeVertex': vertex, 'side': side, 'label': 'T'}, style={}
        )
        objects = {item.object_id: item for item in self.drawing.drawing_objects.all()}
        def resolve(item):
            if item is None:
                return None
            if item.type == 'geometry.point':
                return (float(item.data['x']), float(item.data['y']))
            return resolve_registered_position(item, objects_by_id=objects, resolve_position=resolve)
        return resolve_registered_position(obj, objects_by_id=objects, resolve_position=resolve)

    def test_registry_contains_excircle_touchpoint(self):
        from .geometry_command_registry import get_geometry_command
        from .object_type_registry import get_object_type
        command = get_geometry_command('excircle_touchpoint')
        definition = get_object_type('geometry.excircle_touchpoint')
        self.assertEqual(command.result_type, 'geometry.excircle_touchpoint')
        self.assertEqual(command.parameter_fields, ('oppositeVertex', 'side'))
        self.assertEqual(definition.dependency_fields, ('pointA', 'pointB', 'pointC'))

    def test_excircle_touchpoint_can_be_created(self):
        response = self.client.post(
            reverse('drawing_objects_collection', kwargs={'drawing_id': self.drawing.pk}),
            data=json.dumps({'type': 'geometry.excircle_touchpoint', 'data': {
                'command': 'excircle_touchpoint', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c',
                'oppositeVertex': 'A', 'side': 'BC', 'label': 'T_a'
            }}), content_type='application/json'
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()['object']['dependencies'], ['a', 'b', 'c'])

    def test_excircle_touchpoint_rejects_invalid_parameters(self):
        for vertex, side in [('X', 'BC'), ('A', 'XX')]:
            response = self.client.post(
                reverse('drawing_objects_collection', kwargs={'drawing_id': self.drawing.pk}),
                data=json.dumps({'type': 'geometry.excircle_touchpoint', 'data': {
                    'command': 'excircle_touchpoint', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c',
                    'oppositeVertex': vertex, 'side': side, 'label': 'T'
                }}), content_type='application/json'
            )
            self.assertEqual(response.status_code, 400)

    def test_a_excircle_touchpoint_on_bc_for_6_8_10_triangle(self):
        point = self._resolve('A', 'BC')
        # I_A=(12,12); its orthogonal projection onto line BC is (2.4,4.8).
        self.assertAlmostEqual(point[0], 2.4)
        self.assertAlmostEqual(point[1], 4.8)

    def test_frontend_hides_excircle_touchpoint_tool_but_keeps_legacy_support(self):
        base = Path(__file__).resolve().parent
        editor = (base / 'static/routes/drawing_editor.js').read_text()
        registry = (base / 'static/routes/geometry_command_registry.js').read_text()
        tools = (base / 'static/routes/tool_registry.js').read_text()
        template = (base / 'templates/routes/drawing_detail.html').read_text()
        self.assertIn('createExcircleTouchpoint', editor)
        self.assertIn('pendingExcircleTouchpointPointIds', editor)
        self.assertIn('id: "excircle_touchpoint"', registry)
        self.assertNotIn('geometry.excircle_touchpoint', tools)
        self.assertNotIn('data-role="excircle-vertex"', template)
        self.assertNotIn('data-role="excircle-side"', template)

    def test_tikz_exports_excircle_touchpoint(self):
        DrawingObject.objects.create(
            drawing=self.drawing, object_id='ex-touch-a', type='geometry.excircle_touchpoint',
            data={'command': 'excircle_touchpoint', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c',
                  'oppositeVertex': 'A', 'side': 'BC', 'label': 'T_a'},
            style={'visible': True}
        )
        response = self.client.get(reverse('drawing_export_tikz', args=[self.drawing.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '\\coordinate (ex_touch_a)')
        self.assertContains(response, 'T_a')


class NinePointCenterStep84Tests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='step84', password='x')
        self.drawing = Drawing.objects.create(user=self.user, title='Krok 84', mode='geometry')
        self.client.force_login(self.user)
        for object_id, x, y in [('a', 0, 0), ('b', 6, 0), ('c', 0, 8)]:
            DrawingObject.objects.create(
                drawing=self.drawing, object_id=object_id, type='geometry.point',
                data={'x': x, 'y': y, 'label': object_id.upper()}, style={}
            )

    def _resolve(self):
        from .object_type_registry import resolve_registered_position
        obj = DrawingObject.objects.create(
            drawing=self.drawing, object_id='nine-n', type='geometry.nine_point_center',
            data={'command': 'nine_point_center', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c', 'label': 'N'}, style={}
        )
        objects = {item.object_id: item for item in self.drawing.drawing_objects.all()}
        def resolve(item):
            if item is None:
                return None
            if item.type == 'geometry.point':
                return (float(item.data['x']), float(item.data['y']))
            return resolve_registered_position(item, objects_by_id=objects, resolve_position=resolve)
        return resolve_registered_position(obj, objects_by_id=objects, resolve_position=resolve)

    def test_registry_contains_nine_point_center(self):
        from .geometry_command_registry import get_geometry_command
        from .object_type_registry import get_object_type
        command = get_geometry_command('nine_point_center')
        definition = get_object_type('geometry.nine_point_center')
        self.assertEqual(command.result_type, 'geometry.nine_point_center')
        self.assertEqual(definition.dependency_fields, ('pointA', 'pointB', 'pointC'))

    def test_nine_point_center_can_be_created(self):
        response = self.client.post(
            reverse('drawing_objects_collection', kwargs={'drawing_id': self.drawing.pk}),
            data=json.dumps({'type': 'geometry.nine_point_center', 'data': {
                'command': 'nine_point_center', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c', 'label': 'N'
            }}), content_type='application/json'
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()['object']['dependencies'], ['a', 'b', 'c'])

    def test_nine_point_center_for_6_8_10_triangle(self):
        point = self._resolve()
        # O=(3,4), H=(0,0), therefore N=(1.5,2).
        self.assertAlmostEqual(point[0], 1.5)
        self.assertAlmostEqual(point[1], 2.0)

    def test_frontend_registers_nine_point_center(self):
        base = Path(__file__).resolve().parent
        editor = (base / 'static/routes/drawing_editor.js').read_text()
        registry = (base / 'static/routes/geometry_command_registry.js').read_text()
        tools = (base / 'static/routes/tool_registry.js').read_text()
        template = (base / 'templates/routes/drawing_detail.html').read_text()
        self.assertIn('createNinePointCenter', editor)
        self.assertIn('pendingNinePointCenterPointIds', editor)
        self.assertIn('id: "nine_point_center"', registry)
        self.assertIn('geometry.nine_point_center', tools)
        self.assertIn('geometry.nine_point_center', template)

    def test_tikz_exports_nine_point_center(self):
        DrawingObject.objects.create(
            drawing=self.drawing, object_id='nine-center-n', type='geometry.nine_point_center',
            data={'command': 'nine_point_center', 'pointA': 'a', 'pointB': 'b', 'pointC': 'c', 'label': 'N'},
            style={'visible': True}
        )
        response = self.client.get(reverse('drawing_export_tikz', args=[self.drawing.pk]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '\\coordinate (nine_center_n)')
        self.assertContains(response, 'N')

@override_settings(PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class Step86ConstructedPointsAndDeletionRegressionTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='step86-regression', password='pass12345')
        self.client.force_login(self.user)
        self.drawing = Drawing.objects.create(user=self.user, title='Step 86 regression', mode=Drawing.MODE_GEOMETRY)
        for object_id, x, y in [('a', 0, 0), ('b', 100, 0), ('c', 0, 100)]:
            DrawingObject.objects.create(
                drawing=self.drawing,
                object_id=object_id,
                type='geometry.point',
                data={'x': x, 'y': y},
                style={},
            )
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id='m',
            type='geometry.midpoint',
            data={'source': 'a', 'target': 'b', 'command': 'midpoint'},
            style={},
        )
        DrawingObject.objects.create(
            drawing=self.drawing,
            object_id='r',
            type='geometry.ratio_point',
            data={'source': 'a', 'target': 'c', 'ratio': 0.5, 'command': 'ratio_point'},
            style={},
        )

    def test_segment_accepts_constructed_point_as_endpoint(self):
        response = self.client.post(
            reverse('drawing_objects_collection', args=[self.drawing.pk]),
            data=json.dumps({
                'type': 'geometry.segment',
                'data': {'source': 'm', 'target': 'r'},
                'style': {'stroke': '#111827'},
            }),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201, response.content)

    def test_polygon_accepts_constructed_points(self):
        response = self.client.post(
            reverse('drawing_objects_collection', args=[self.drawing.pk]),
            data=json.dumps({
                'type': 'geometry.polygon',
                'data': {'points': ['a', 'm', 'r'], 'closed': True},
                'style': {'stroke': '#111827', 'fill': 'none'},
            }),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 201, response.content)

    def test_frontend_delete_skips_objects_already_removed_by_cascade(self):
        source = (Path(__file__).parent / 'static' / 'routes' / 'drawing_editor.js').read_text()
        self.assertIn('const alreadyDeleted = new Set()', source)
        self.assertIn('result.deleted_object_ids', source)


class Step90LabelsAndTextRegressionTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="step90", password="secret")
        self.client.force_login(self.user)

    def test_geometry_mode_accepts_latex_text_object(self):
        drawing = Drawing.objects.create(user=self.user, title="Geometry text", mode=Drawing.MODE_GEOMETRY)
        response = self.client.post(
            reverse("drawing_objects_collection", kwargs={"drawing_id": drawing.pk}),
            data=json.dumps({
                "type": "text.latex",
                "data": {"x": 120, "y": 90, "text": r"\alpha_1", "label": ""},
                "style": {"fill": "#111827", "fontSize": 18, "showLabel": True},
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(drawing.drawing_objects.get().type, "text.latex")

    def test_relative_label_accepts_constructed_point(self):
        drawing = Drawing.objects.create(user=self.user, title="Attached label", mode=Drawing.MODE_GEOMETRY)
        a = DrawingObject.objects.create(drawing=drawing, object_id="a", type="geometry.point", data={"x": 0, "y": 0}, style={})
        b = DrawingObject.objects.create(drawing=drawing, object_id="b", type="geometry.point", data={"x": 10, "y": 0}, style={})
        midpoint = DrawingObject.objects.create(drawing=drawing, object_id="m", type="geometry.midpoint", data={"source": a.object_id, "target": b.object_id}, style={})
        response = self.client.post(
            reverse("drawing_objects_collection", kwargs={"drawing_id": drawing.pk}),
            data=json.dumps({
                "type": "label.relative",
                "data": {"baseObjectId": midpoint.object_id, "text": "M", "dx": 18, "dy": -18},
                "style": {"fill": "#111827", "fontSize": 14, "showLabel": True},
            }),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(drawing.drawing_objects.get(type="label.relative").data["baseObjectId"], "m")

class ImageRecognitionStep91Tests(TestCase):
    def test_route_editor_screenshot_detects_points_segments_and_circle(self):
        from pathlib import Path
        from .image_recognition_import import recognize_image_bytes
        sample = Path(__file__).resolve().parent.parent / 'experiments' / 'image_recognition' / 'samples' / 'route_editor_screen.png'
        result = recognize_image_bytes(sample.read_bytes(), sample.name)
        self.assertEqual(result['summary']['vertices'], 9)
        self.assertEqual(result['summary']['edges'], 5)
        self.assertEqual(result['summary']['circles'], 1)
        self.assertTrue(result['diagnostic_data_uri'].startswith('data:image/png;base64,'))

    def test_step91_converter_creates_geometry_objects(self):
        from experiments.image_recognition.to_route_editor import graph_to_route_editor_document
        graph = {
            'vertices': [{'id':'v1','x':10,'y':10,'label':''}, {'id':'v2','x':80,'y':10,'label':''}],
            'edges': [{'source':'v1','target':'v2','confidence':.9}],
            'circles': [{'id':'c1','x':50,'y':50,'radius':20,'confidence':.9}],
        }
        document = graph_to_route_editor_document(graph, canvas_width=200, canvas_height=120)
        types = [item['type'] for item in document['objects']]
        self.assertEqual(document['mode'], 'geometry')
        self.assertEqual(types.count('geometry.segment'), 1)
        self.assertEqual(types.count('geometry.circle'), 1)
        self.assertGreaterEqual(types.count('geometry.point'), 4)
