import { getPantryItems } from "@/lib/actions/pantry";
import { PantryClient } from "@/components/pantry-client";

export default async function PantryPage() {
    const items = await getPantryItems();

    return (
        <div className="max-w-4xl mx-auto">
            <PantryClient items={items} />
        </div>
    );
}
