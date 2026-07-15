from django.db import models
from django.contrib.auth.models import User


class Drawing(models.Model):
    """Ogólny rysunek użytkownika dla trybów grafu, geometrii i wykresów."""
    MODE_GRAPH = 'graph'
    MODE_GEOMETRY = 'geometry'
    MODE_PLOT = 'plot'
    MODE_MIXED = 'mixed'

    # MODE_MIXED zostaje jako stała techniczna dla starszych rysunków,
    # ale nie jest już dostępny w formularzu tworzenia nowych rysunków.
    MODE_CHOICES = [
        (MODE_GRAPH, 'Graf'),
        (MODE_GEOMETRY, 'Geometria'),
        (MODE_PLOT, 'Wykresy'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='drawings')
    title = models.CharField(max_length=120)
    mode = models.CharField(max_length=30, choices=MODE_CHOICES, default=MODE_GRAPH)
    metadata = models.JSONField(default=dict, blank=True)
    settings = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at', '-created_at']

    def __str__(self):
        return f"{self.title} ({self.mode}) by {self.user.username}"


class DrawingObject(models.Model):
    """Pojedynczy obiekt strukturalnego rysunku.

    type jest namespacowany, np. graph.vertex, graph.edge, geometry.circle.
    data przechowuje dane zależne od typu obiektu, a style informacje wizualne.
    """
    drawing = models.ForeignKey(Drawing, on_delete=models.CASCADE, related_name='drawing_objects')
    object_id = models.CharField(max_length=64)
    type = models.CharField(max_length=100)
    data = models.JSONField(default=dict, blank=True)
    style = models.JSONField(default=dict, blank=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'id']
        constraints = [
            models.UniqueConstraint(
                fields=['drawing', 'object_id'],
                name='unique_object_id_per_drawing',
            )
        ]

    def __str__(self):
        return f"{self.object_id}: {self.type} in {self.drawing.title}"
