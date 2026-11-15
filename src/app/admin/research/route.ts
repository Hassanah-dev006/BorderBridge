/**
 * NFR-PRI-05 — the aggregate research export.
 *
 * A route handler rather than a page because the product is a file. Two things happen
 * here that are easy to leave out and are the whole point of the requirement:
 *
 *  1. The risk report is computed before the file is written, and a release that fails
 *     it is refused. A check that produces a warning nobody reads is not a check.
 *  2. The warnings travel with the file, in a header and in a comment line, so the
 *     person who receives it knows what was withheld and why.
 */
import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/session';
import { isConfigured } from '@/lib/db';
import { researchRecords } from '@/lib/store';
import { aggregate, riskReport, suppress, toCsv, MIN_GROUP } from '@/lib/research';
import { log, subjectRef } from '@/lib/log';

export const dynamic = 'force-dynamic';

const BY = ['corridor', 'category', 'month'];

export async function GET(): Promise<Response> {
  const user = await currentUser();

  // NFR-SEC-04 — role verified server-side on every request, not inferred from the
  // fact that the link only appears on an administrative page.
  if (!user || user.role !== 'admin') {
    return new NextResponse('Not found', { status: 404 });
  }
  if (!isConfigured()) {
    return new NextResponse('No database configured.', { status: 503 });
  }

  const records = await researchRecords();
  const cells = suppress(aggregate(records, BY), 'category');
  const risk = riskReport(cells);

  log.info('research.export', {
    subject: subjectRef(user.id),
    cells: risk.cells,
    published: risk.published,
    safe: risk.safe,
  });

  // The extract is never served when the check fails, and there is deliberately no
  // override parameter. The point of a pre-release test is that it can stop a release;
  // a check with a bypass is a check that will be bypassed on the afternoon somebody
  // needs the file for a meeting.
  if (!risk.safe) {
    return NextResponse.json(
      {
        released: false,
        reason: 'The extract did not pass the re-identification check.',
        risk,
        minimumGroup: MIN_GROUP,
      },
      { status: 409 },
    );
  }

  const preamble = [
    `# BorderBridge aggregate extract, generated ${new Date().toISOString()}`,
    `# Minimum group size: ${MIN_GROUP} distinct traders.`,
    `# ${risk.suppressedBelowThreshold} cell(s) suppressed as below the minimum.`,
    `# ${risk.suppressedComplementary} further cell(s) suppressed so the first cannot be recovered by subtraction.`,
    '# Counts are of distinct traders, not of movements. Measures are means, never sums.',
  ].join('\n');

  const body = `${preamble}\n${toCsv(cells, BY)}\n`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="borderbridge-aggregate-${new Date().toISOString().slice(0, 10)}.csv"`,
      'X-Suppressed-Cells': String(risk.suppressedBelowThreshold + risk.suppressedComplementary),
      // NFR-MNT-05 — nothing personal in a header either.
      'Cache-Control': 'no-store',
    },
  });
}
