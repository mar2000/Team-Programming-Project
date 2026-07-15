from django.contrib import admin

from .models import Drawing, DrawingObject


class DrawingObjectInline(admin.TabularInline):
    model = DrawingObject
    extra = 0
    fields = ('object_id', 'type', 'order', 'data', 'style')


@admin.register(Drawing)
class DrawingAdmin(admin.ModelAdmin):
    list_display = ('title', 'user', 'mode', 'created_at', 'updated_at')
    list_filter = ('mode', 'user')
    search_fields = ('title', 'user__username')
    inlines = [DrawingObjectInline]


@admin.register(DrawingObject)
class DrawingObjectAdmin(admin.ModelAdmin):
    list_display = ('object_id', 'type', 'drawing', 'order', 'updated_at')
    list_filter = ('type', 'drawing__mode')
    search_fields = ('object_id', 'type', 'drawing__title')
