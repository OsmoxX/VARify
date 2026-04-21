from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('matches', '0027_matchsubscription_add_user_fk'),
    ]

    operations = [
        migrations.AddField(
            model_name='livematch',
            name='has_incident_data',
            field=models.BooleanField(
                default=True,
                help_text='False jeśli API zwróciło 404 dla /incidents — mecz pomijany w monitorze',
            ),
        ),
    ]
