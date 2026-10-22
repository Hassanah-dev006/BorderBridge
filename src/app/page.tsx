/**
 * FR-REQ-01 — state a trade intention.
 *
 * One question, four fields. The interface is organised around the consignment, not
 * around a menu of features (SRS UI-01).
 */
import { listSupportedCorridors, listProducts } from '@/lib/repository';

export default function Home() {
  const corridors = listSupportedCorridors();
  const products = listProducts();

  return (
    <div>
      <h1 className="text-xl font-semibold text-ink">What are you moving?</h1>
      <p className="mt-1 text-sm text-gray-600">
        Tell us the route, the goods and the value. We will tell you which documents you need,
        what it should cost, and which crossing to use.
      </p>

      <form action="/plan" method="GET" className="mt-6 space-y-5">
        <div>
          <label htmlFor="corridor" className="block text-sm font-medium text-ink">Route</label>
          <select
            id="corridor" name="corridor" required defaultValue="RW-UG"
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base"
          >
            {corridors.map((c) => (
              <option key={c.id} value={c.id}>{c.originName} → {c.destinationName}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="product" className="block text-sm font-medium text-ink">Product</label>
          <select
            id="product" name="product" required defaultValue="coffee-green"
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.hsCode})</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="quantity" className="block text-sm font-medium text-ink">Quantity</label>
            <input
              id="quantity" name="quantity" type="number" min="1" step="any" required defaultValue={200}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base"
            />
            <p className="mt-1 text-xs text-gray-500">in kg, litres or pieces</p>
          </div>
          <div>
            <label htmlFor="value" className="block text-sm font-medium text-ink">Value of goods</label>
            <div className="mt-1 flex gap-2">
              <select
                name="currency" aria-label="Currency" defaultValue="USD"
                className="rounded-md border border-gray-300 bg-white px-2 py-2 text-base"
              >
                <option value="USD">USD</option>
                <option value="RWF">RWF</option>
                <option value="UGX">UGX</option>
              </select>
              <input
                id="value" name="value" type="number" min="1" step="any" required defaultValue={1200}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">what the goods are worth</p>
          </div>
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-brand px-4 py-3 text-base font-semibold text-white hover:bg-[#17395A]"
        >
          Show me what I need
        </button>
      </form>

      <section className="mt-8 rounded-md border border-brand-light bg-brand-pale p-4">
        <h2 className="text-sm font-semibold text-brand">Why this exists</h2>
        <p className="mt-1 text-sm leading-relaxed text-gray-700">
          The EAC Simplified Trade Regime lets consignments under USD 2,000 cross without full
          customs procedure — but traders routinely do not know it applies to them. BorderBridge
          works that out for your specific consignment and shows the rule it relied on.
        </p>
      </section>
    </div>
  );
}
