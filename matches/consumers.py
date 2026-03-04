import json
from channels.generic.websocket import AsyncWebsocketConsumer


class MatchConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.match_id = self.scope['url_route']['kwargs']['match_id']
        self.room_group_name = f'match_{self.match_id}'

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    # Uniwersalny handler zdarzeń meczowych
    # Obsługuje: gole, kartki, zmiany, okresy (HT/FT)
    async def match_event(self, event):
        """
        event = {
            'type': 'match_event',
            'event_type': 'goal' | 'card' | 'substitution' | 'period',
            'icon': '⚽' | '🟨' | '🔄' | '⏱️',
            'message': 'Tekst powiadomienia',
            'home_score': 2,       # opcjonalne — do aktualizacji wyniku na stronie
            'away_score': 1,       # opcjonalne
            'status': '2nd half',  # opcjonalne — do aktualizacji statusu
        }
        """
        payload = {
            'event_type': event.get('event_type', 'info'),
            'icon': event.get('icon', 'ℹ️'),
            'message': event.get('message', ''),
        }
        # Przekaż opcjonalne pola do frontendu
        for key in ('home_score', 'away_score', 'status'):
            if key in event:
                payload[key] = event[key]
        await self.send(text_data=json.dumps(payload))