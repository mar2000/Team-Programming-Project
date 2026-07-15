from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ('routes', '0010_remove_mixed_from_new_drawing_modes'),
    ]

    operations = [
        migrations.DeleteModel(name='Edge'),
        migrations.DeleteModel(name='Point'),
        migrations.DeleteModel(name='Route'),
        migrations.DeleteModel(name='BackgroundImage'),
    ]
