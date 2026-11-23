import { SwaggerExplorer } from "@/components/features/swagger-explorer";
import "swagger-ui-dist/swagger-ui.css";
import styles from "@/components/features/swagger-explorer.module.css";

export default function DocumentationPage() {
  return (
    <main className={styles.page}>
      <SwaggerExplorer />
    </main>
  );
}
