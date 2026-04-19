import { Controller, Get, Patch, Param, Body, Query } from '@nestjs/common';
import { RevenueService } from './revenue.service';
import { BatchUpdateMappingTeamDto } from './dto/batch-update-mapping-team.dto';
import { GetMetricsDto } from './dto/get-metrics.dto';
import { UpdateMappingDto } from './dto/update-mapping.dto';

@Controller('v1/revenue')
export class RevenueController {
    constructor(private readonly revenueService: RevenueService) { }

    @Get('metrics')
    async getMetrics(
        @Query() query: GetMetricsDto,
    ) {
        const { startDate, endDate } = query;
        return this.revenueService.getAggregatedMetrics(startDate, endDate);
    }

    @Get('mappings')
    async getMappings() {
        return this.revenueService.getMappings();
    }

    /**
     * Batch-update the team for multiple revenue-mapping IDs at once.
     * Body: { ids: number[], team: string | null }
     * Returns the full updated mappings list.
     *
     * MUST be declared BEFORE the :id route.
     */
    @Patch('mappings/batch/team')
    async batchUpdateTeam(@Body() body: BatchUpdateMappingTeamDto) {
        const { ids } = body;
        const team = body.team ?? null;
        if (!Array.isArray(ids) || ids.length === 0) return this.revenueService.getMappings();
        for (const id of ids) {
            await this.revenueService.updateMappingTeam(id, team);
        }
        return this.revenueService.getMappings();
    }

    @Patch('mappings/:id')
    async updateMapping(@Param('id') id: string, @Body() body: UpdateMappingDto) {
        return this.revenueService.updateMappingTeam(Number(id), body.team ?? null);
    }
}
