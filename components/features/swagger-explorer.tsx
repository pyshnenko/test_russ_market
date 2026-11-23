"use client";

import styles from "./swagger-explorer.module.css";

import { useState } from "react";
import Script from "next/script";

type SwaggerUI = (options: { url: string; dom_id: string; validatorUrl: null; deepLinking: boolean }) => void;

export function SwaggerExplorer() {
  const [failed, setFailed] = useState(false);
  return (
    <>
      <div id="schedule-openapi" />
      {failed && <p role="alert" className={styles.error}>Не удалось загрузить Swagger UI.</p>}
      <Script src="/api/openapi/assets/swagger-ui-bundle.js" strategy="afterInteractive" onReady={() => {
        const swagger = (window as Window & { SwaggerUIBundle?: SwaggerUI }).SwaggerUIBundle;
        if (!swagger) { setFailed(true); return; }
        swagger({ url: "/api/openapi", dom_id: "#schedule-openapi", validatorUrl: null, deepLinking: true });
      }} onError={() => setFailed(true)} />
    </>
  );
}
