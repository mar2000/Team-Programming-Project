from django.urls import path
from . import views

urlpatterns = [

    path('', views.DrawingListView.as_view(), name='home'),
    path('drawings/', views.DrawingListView.as_view(), name='drawing_list'),
    path('drawings/create/', views.DrawingCreateView.as_view(), name='drawing_create'),
    path('drawings/import/', views.import_drawing_json, name='drawing_import_json'),
    path('drawings/import/image/', views.import_drawing_image, name='drawing_import_image'),
    path('drawings/<int:pk>/', views.DrawingDetailView.as_view(), name='drawing_detail'),
    path('drawings/<int:pk>/delete/', views.DrawingDeleteView.as_view(), name='drawing_delete'),
    path('drawings/<int:pk>/duplicate/', views.duplicate_drawing, name='drawing_duplicate'),
    path('drawings/<int:pk>/export/tikz/', views.export_drawing_tikz, name='drawing_export_tikz'),
    path('drawings/<int:pk>/export/json/', views.export_drawing_json, name='drawing_export_json'),
    path('drawings/<int:pk>/export/tikz/preview/', views.drawing_tikz_preview, name='drawing_tikz_preview'),
    path('drawings/<int:pk>/settings/', views.drawing_settings_api, name='drawing_settings_api'),
    path('drawings/<int:drawing_id>/objects/', views.drawing_objects_collection, name='drawing_objects_collection'),
    path('drawings/<int:drawing_id>/objects/bulk/', views.drawing_objects_bulk_create, name='drawing_objects_bulk_create'),
    path('drawings/<int:drawing_id>/objects/<str:object_id>/', views.drawing_object_detail, name='drawing_object_detail'),
]
