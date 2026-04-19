import {
  Controller,
  Get,
  Post,
  Query,
  HttpException,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AnalyticsService } from './utm-analytics.service';
import { GetAggregatedMetricsDto } from './dto/get-aggregated-metrics.dto';
import { GetCampaignsDto } from './dto/get-campaigns.dto';
import { GetCountryStatsDto } from './dto/get-country-stats.dto';
import { GetHeadlinesDto } from './dto/get-headlines.dto';
import { GetUtmMetricsDto } from './dto/get-utm-metrics.dto';

@Controller('v1/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('utm/metrics')
  async getUtmMetrics(@Query() query: GetUtmMetricsDto) {
    const { rollup, startDate, endDate, utmSource, utmMedium, utmCampaign } =
      query;

    if (!rollup || !startDate || !endDate) {
      throw new HttpException('Missing params', HttpStatus.BAD_REQUEST);
    }

    const filters = {
      utmSource: this.normalizeArray(utmSource),
      utmMedium: this.normalizeArray(utmMedium),
      utmCampaign: this.normalizeArray(utmCampaign),
    };

    return await this.analyticsService.getMetrics(
      rollup,
      startDate,
      endDate,
      filters,
    );
  }

  @Get('headlines')
  async getHeadlines(@Query() query: GetHeadlinesDto) {
    const { utmSource } = query;
    const filters = {
      utmSource: this.normalizeArray(utmSource),
    };
    return await this.analyticsService.getHeadlines(filters);
  }

  @Get('utm/metrics-aggregated')
  async getAggregatedMetrics(@Query() query: GetAggregatedMetricsDto) {
    const { startDate, endDate, utmSource, utmMedium, utmCampaign } = query;

    if (!startDate || !endDate) {
      throw new HttpException(
        'Missing startDate or endDate',
        HttpStatus.BAD_REQUEST,
      );
    }

    const filters = {
      utmSource: this.normalizeArray(utmSource),
      utmMedium: this.normalizeArray(utmMedium),
      utmCampaign: this.normalizeArray(utmCampaign),
    };

    return await this.analyticsService.getAggregatedMetrics(
      startDate,
      endDate,
      filters,
    );
  }

  @Get('campaigns')
  async getCampaigns(@Query() query: GetCampaignsDto) {
    const { startDate, endDate, utmSource } = query;

    if (!startDate || !endDate) {
      throw new HttpException(
        'Missing startDate or endDate',
        HttpStatus.BAD_REQUEST,
      );
    }
    const filters = { utmSource: this.normalizeArray(utmSource) };
    return await this.analyticsService.getAvailableCampaigns(
      startDate,
      endDate,
      filters,
    );
  }

  @Get('country-stats')
  async getCountryStats(@Query() query: GetCountryStatsDto) {
    const { startDate, endDate, utmSource } = query;

    if (!startDate || !endDate) {
      throw new HttpException(
        'Missing startDate or endDate',
        HttpStatus.BAD_REQUEST,
      );
    }
    const filters = { utmSource: this.normalizeArray(utmSource) };
    return await this.analyticsService.getCountryStats(
      startDate,
      endDate,
      filters,
    );
  }

  @Post('sync/manual')
  async triggerManualSync() {
    await this.analyticsService.syncBigQueryData();
    return { status: 'success', message: 'Sync completed' };
  }

  @Post('import/legacy')
  @UseInterceptors(FileInterceptor('file'))
  async importLegacyData(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new HttpException('No CSV file provided', HttpStatus.BAD_REQUEST);
    }

    try {
      const count = await this.analyticsService.importLegacyData(file.buffer);
      return {
        status: 'success',
        message: `Imported ${count} legacy records successfully.`,
      };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Import failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private normalizeArray(param?: string | string[]): string[] | undefined {
    if (!param) return undefined;
    return Array.isArray(param) ? param : [param];
  }
}
