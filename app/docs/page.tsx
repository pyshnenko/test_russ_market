import { SwaggerExplorer } from "@/components/features/swagger-explorer";
import "swagger-ui-dist/swagger-ui.css";

export default function DocumentationPage() {
  return (
    <main className="min-h-dvh bg-white">
      <SwaggerExplorer />
    </main>
  );
}
