/**
 * NFR-USA-07, Table 3.3 — the USSD aggregator callback.
 *
 * Shaped for the Africa's Talking callback format, which most East African
 * aggregators either use or can be configured to send: a form POST carrying
 * sessionId, phoneNumber and the cumulative input history in `text`.
 *
 * The handler is deliberately thin. All of the state derivation and rendering lives in
 * src/lib/ussd.ts as pure functions, so the channel is unit tested without a gateway
 * and swapping aggregators means rewriting this file and nothing else — the same
 * adapter discipline constraint C8 applies to data sources.
 */
import { NextResponse } from 'next/server';
import { buildTradePlan, UnsupportedCorridorError, UnknownProductError } from '@/lib/engines';
import { getRulesForCorridor, listSupportedCorridors, listProducts } from '@/lib/repository';
import { render, serialise, stateFrom, summarise, type Choice } from '@/lib/ussd';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';

/** Five routes and six goods: what fits one USSD page without paging. */
function menuChoices(): { corridors: Choice[]; products: Choice[] } {
  return {
    corridors: listSupportedCorridors().map((c) => ({
      id: c.id,
      label: `${c.originName} to ${c.destinationName}`,
    })),
    products: listProducts().slice(0, 6).map((p) => ({ id: p.id, label: p.name })),
  };
}

export async function POST(request: Request): Promise<Response> {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return new NextResponse('END Could not read that request.', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const text = String(form.get('text') ?? '');
  const choices = menuChoices();
  const state = stateFrom({ text, ...choices });

  // NFR-MNT-05 — the phone number is the one thing this callback always carries, and
  // it is the one thing that must never reach a log. Depth of the menu is useful;
  // who dialled is not.
  log.info('ussd.callback', { step: state.step, depth: text.split('*').filter(Boolean).length });

  let result: string | undefined;

  if (state.step === 'result' && state.corridorId && state.productId && state.declaredValue) {
    try {
      const rules = getRulesForCorridor(state.corridorId);
      const plan = buildTradePlan(
        {
          corridorId: state.corridorId,
          productId: state.productId,
          // USSD cannot ask for everything. Quantity is assumed at the simplified-regime
          // boundary so the eligibility answer is the one that matters; the SMS that
          // follows says so, and the full flow is on the web.
          quantity: 1,
          declaredValue: state.declaredValue,
          currency: 'USD',
        },
        [],
        rules,
      );

      const mandatory = plan.checklist.filter((i) => i.mandatory);
      result = summarise({
        documents: mandatory.length,
        firstDocument: mandatory[0]?.name,
        simplified: plan.eligibility.eligible,
        totalUsd: plan.cost.totalUsd,
        crossing: plan.recommendedCrossing,
      });
    } catch (error) {
      if (error instanceof UnsupportedCorridorError || error instanceof UnknownProductError) {
        result = 'That route is not covered yet. Try the website.';
      } else {
        log.error('ussd.planFailed', { error });
        result = 'Could not work that out. Please dial again.';
      }
    }
  }

  return new NextResponse(serialise(render(state, { ...choices, result })), {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
