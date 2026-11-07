import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AiService, ChatMessage } from './ai.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';

class ChatDto {
  history!: ChatMessage[];
  message!: string;
}

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @UseGuards(JwtAuthGuard)
  async chat(@Body() body: ChatDto) {
    try {
      const reply = await this.aiService.chat(body.history ?? [], body.message);
      return { reply };
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
}
