from django.contrib import admin
from django.urls import path, include
from django.contrib.auth import views as auth_views
from routes import views as route_views

urlpatterns = [

    path('', route_views.DrawingListView.as_view(), name='home'),
    path('drawings/', route_views.DrawingListView.as_view(), name='drawing_list'),
    path('drawings/create/', route_views.DrawingCreateView.as_view(), name='drawing_create'),
    path('drawings/import/', route_views.import_drawing_json, name='drawing_import_json'),
    path('drawings/import/image/', route_views.import_drawing_image, name='drawing_import_image'),
    path('drawings/<int:pk>/', route_views.DrawingDetailView.as_view(), name='drawing_detail'),
    path('drawings/<int:pk>/delete/', route_views.DrawingDeleteView.as_view(), name='drawing_delete'),
    path('drawings/<int:pk>/duplicate/', route_views.duplicate_drawing, name='drawing_duplicate'),
    path('drawings/<int:pk>/export/tikz/', route_views.export_drawing_tikz, name='drawing_export_tikz'),
    path('drawings/<int:pk>/export/json/', route_views.export_drawing_json, name='drawing_export_json'),
    path('drawings/<int:pk>/export/tikz/preview/', route_views.drawing_tikz_preview, name='drawing_tikz_preview'),
    path('drawings/<int:pk>/settings/', route_views.drawing_settings_api, name='drawing_settings_api'),
    path('drawings/<int:drawing_id>/objects/', route_views.drawing_objects_collection, name='drawing_objects_collection'),
    path('drawings/<int:drawing_id>/objects/bulk/', route_views.drawing_objects_bulk_create, name='drawing_objects_bulk_create'),
    path('drawings/<int:drawing_id>/objects/<str:object_id>/', route_views.drawing_object_detail, name='drawing_object_detail'),
    path('admin/', admin.site.urls),
    path('login/', auth_views.LoginView.as_view(template_name='routes/login.html'), name='login'),
    path('logout/', auth_views.LogoutView.as_view(), name='logout'),
    path('register/', route_views.register, name='register'),
]
