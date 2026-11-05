/**
 * Seed: realistic DME prior-authorization demo data.
 * Run: pnpm --filter @dme/api exec prisma db seed
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const existing = await prisma.dmeOrder.count();
  if (existing > 0) {
    console.log(`Seed skipped — ${existing} orders already present.`);
    return;
  }

  // --- Patients -------------------------------------------------------------
  const sarah = await prisma.patient.create({
    data: {
      firstName: 'Sarah',
      lastName: 'Mitchell',
      dateOfBirth: new Date('1958-04-12'),
      insuranceProvider: 'Medicare Part B',
      memberId: 'MBR-88213',
    },
  });

  const james = await prisma.patient.create({
    data: {
      firstName: 'James',
      lastName: 'Okafor',
      dateOfBirth: new Date('1971-11-03'),
      insuranceProvider: 'Blue Cross Blue Shield',
      memberId: 'BCBS-440917',
    },
  });

  // --- Orders (HCPCS equipment codes + ICD-10 diagnoses) --------------------
  await prisma.dmeOrder.createMany({
    data: [
      {
        patientId: sarah.id,
        equipmentCode: 'E0601', // Continuous positive airway pressure (CPAP) device
        diagnosisCode: 'G47.33', // Obstructive sleep apnea
        quantity: 1,
        clinicalNotes:
          'In-lab sleep study AHI 32/hr, ESS score 14. BMI 34. Prior 30-day ' +
          'PAP trial discontinued due to mask intolerance; new mask + humidifier ' +
          'requested. Compliant use documented 4+ hours/night for 90 days.',
        status: 'SUBMITTED',
      },
      {
        patientId: sarah.id,
        equipmentCode: 'E0143', // Walker, folding, wheeled, with or without seat
        diagnosisCode: 'M62.81', // Muscle weakness (generalized)
        quantity: 1,
        clinicalNotes:
          'Recurrent falls (2 in past 60 days). PT evaluation completed: requires ' +
          'rolling walker for household ambulation. Patient175cm, weight 82kg — ' +
          'bariatric-strength frame not required.',
        status: 'SUBMITTED',
      },
      {
        patientId: james.id,
        equipmentCode: 'K0001', // Manual wheelchair, standard, fixed full-length arms
        diagnosisCode: 'G82.21', // Paraplegia, incomplete
        quantity: 1,
        clinicalNotes:
          'Unable to ambulate 15 feet without assistance post T10 incomplete ' +
          'spinal cord injury. Home evaluation: thresholds require wheeled mobility ' +
          'for ADL independence. Weight 78kg, indoor use only.',
        status: 'SUBMITTED',
      },
    ],
  });

  // --- Audit trail ----------------------------------------------------------
  await prisma.auditLog.createMany({
    data: [
      { entityType: 'patient', entityId: sarah.id, action: 'created', actor: 'seed' },
      { entityType: 'patient', entityId: james.id, action: 'created', actor: 'seed' },
      { entityType: 'dme_order', entityId: sarah.id, action: 'seeded', actor: 'seed' },
    ],
  });

  const orders = await prisma.dmeOrder.count();
  const patients = await prisma.patient.count();
  console.log(`Seed complete — ${patients} patients, ${orders} orders.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
