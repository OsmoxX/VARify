import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString, MaxLength, ValidateNested } from 'class-validator';
import { AiService, MAX_HISTORY_TURNS, validateHistory } from './ai.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { TierGuard } from '../common/guards/tier.guard.js';
import { RequireTier } from '../common/decorators/require-tier.decorator.js';

class ChatTurnDto {
  @IsIn(['user', 'assistant']) role!: 'user' | 'assistant';
  @IsString() @MaxLength(8000) content!: string;
}

class ChatDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_HISTORY_TURNS * 2)
  @ValidateNested({ each: true })
  @Type(() => ChatTurnDto)
  history!: ChatTurnDto[];
}

/** AI Analyst — plan PREMIUM (Django @require_tier(PREMIUM)). */
@Controller('ai')
@UseGuards(JwtAuthGuard, TierGuard)
@RequireTier('PREMIUM')
export class AiController {
  constructor(private readonly ai: AiService) {}

  /** POST /api/ai/chat  { history: [{role, content}…] }  → { response } */
  @Post('chat')
  @HttpCode(200)
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  async chat(@Body() body: ChatDto) {
    const history = validateHistory(body.history);
    return { response: await this.ai.chat(history) };
  }
}
