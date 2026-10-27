import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

const EVERY_TWO_MINUTES = '0 */2 * * * *';
import { AppService } from './app.service.js';

@Injectable()
export class ReassignmentScheduler {
  private readonly logger = new Logger(ReassignmentScheduler.name);
  private isRunning = false;

  constructor(private readonly appService: AppService) {}

  @Cron(EVERY_TWO_MINUTES)
  async retryStuckReassignments(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      await this.appService.retryStuckReassignments();
    } catch (error) {
      this.logger.error(
        'Scheduled reassignment retry failed.',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.isRunning = false;
    }
  }
}
