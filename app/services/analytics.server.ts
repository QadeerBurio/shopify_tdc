// This does the math for the ROI dashboard - pulls saved orders
// from the database and adds them up.
import prisma from "../db.server";

export interface RoiMetrics {
  periodStart: Date;
  periodEnd: Date;
  totalOrders: number;
  totalRevenue: number;
  totalDiscount: number;
  netRevenue: number;
  uniqueCustomers: number;
  avgOrderValue: number;
}

export async function getPartnerRoi(
  partnerBrandId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<RoiMetrics> {
  const orders = await prisma.orderAttribution.findMany({
    where: {
      partnerBrandId,
      orderCreatedAt: {
        gte: periodStart,
        lte: periodEnd,
      },
    },
  });

  if (orders.length === 0) {
    return {
      periodStart,
      periodEnd,
      totalOrders: 0,
      totalRevenue: 0,
      totalDiscount: 0,
      netRevenue: 0,
      uniqueCustomers: 0,
      avgOrderValue: 0,
    };
  }

  const totalRevenue = orders.reduce((sum, o) => sum + o.orderTotal, 0);
  const totalDiscount = orders.reduce((sum, o) => sum + o.discountAmount, 0);
  const uniqueCustomers = new Set(
    orders.map((o) => o.customerId).filter(Boolean)
  ).size;

  return {
    periodStart,
    periodEnd,
    totalOrders: orders.length,
    totalRevenue,
    totalDiscount,
    netRevenue: totalRevenue - totalDiscount,
    uniqueCustomers,
    avgOrderValue: totalRevenue / orders.length,
  };
}

export async function createRoiSnapshot(
  partnerBrandId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<void> {
  const metrics = await getPartnerRoi(partnerBrandId, periodStart, periodEnd);

  await prisma.roiSnapshot.create({
    data: {
      partnerBrandId,
      snapshotDate: new Date(),
      periodStart,
      periodEnd,
      totalOrders: metrics.totalOrders,
      totalRevenue: metrics.totalRevenue,
      totalDiscount: metrics.totalDiscount,
      netRevenue: metrics.netRevenue,
      uniqueCustomers: metrics.uniqueCustomers,
      avgOrderValue: metrics.avgOrderValue,
    },
  });
}
