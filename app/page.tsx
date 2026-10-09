import { EXAMPLES } from "@/lib/examples";
import type { ModelConfig, ModelPrices } from "@/lib/models";
import candidates from "@/config/candidates.json";
import prices from "@/config/model-prices.json";
import { CheckPage } from "./check-page";

// The page reads the model list, the dated prices and the three recorded
// examples when it is built. Nothing here touches the network or the key.
export default function Home() {
  return <CheckPage config={candidates as unknown as ModelConfig} prices={prices as unknown as ModelPrices} examples={EXAMPLES} />;
}
