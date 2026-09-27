import { z } from 'zod';

export const warehousePreflightSchema = z.object({
  targetThroughputPerHour: z
    .number({ invalid_type_error: 'Квота грузопотока должна быть числом' })
    .min(1, 'Укажите плановую квоту выработки (не менее 1 палл/ч)'),
  averageWorkerSalaryRub: z
    .number()
    .min(10000, 'Базовый ФОТ комплектовщика должен быть не менее 10 000 ₽'),
  totalAreaSqm: z
    .number()
    .min(20, 'Площадь склада должна быть не менее 20 м²'),
  shiftsPerDay: z
    .number()
    .min(1, 'Количество смен должно быть от 1 до 3')
    .max(3, 'Количество смен не может превышать 3'),
  inboundDocksCount: z
    .number()
    .min(1, 'Ошибка топологии: установите на складе хотя бы одни ворота приёмки (DOCK_INBOUND)'),
  outboundDocksCount: z
    .number()
    .min(1, 'Ошибка топологии: установите на складе хотя бы одни ворота отгрузки (DOCK_OUTBOUND)'),
  racksCount: z
    .number()
    .min(1, 'Ошибка топологии: разместите на складе хотя бы один стеллаж (RACK)'),
  fleetSize: z
    .number()
    .min(1, 'Флот не укомплектован: рассчитайте парк в Блоке 6 или задайте роботов в Песочнице'),
  hasSelectedRobot: z
    .boolean()
    .refine((val) => val === true, 'Не выбрана базовая модель робота для моделирования'),
});

export type WarehousePreflightData = z.infer<typeof warehousePreflightSchema>;

export function validateWarehousePreflight(data: WarehousePreflightData): {
  success: boolean;
  error?: string;
} {
  const result = warehousePreflightSchema.safeParse(data);
  if (!result.success) {
    return {
      success: false,
      error: result.error.errors[0]?.message || 'Параметры склада не прошли проверку готовности',
    };
  }
  return { success: true };
}
