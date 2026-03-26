import Head from "next/head";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta
          name="memory-lane-api-base"
          content={process.env.NEXT_PUBLIC_API_BASE || ""}
        />
      </Head>
      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=Source+Serif+4:wght@400;600&display=swap");

        :root {
          --ink: #0f0f10;
          --muted: #5b5b66;
          --accent: #ff7a1a;
          --paper: #f8f5f0;
          --panel: #ffffff;
        }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          font-family: "Space Grotesk", sans-serif;
          color: var(--ink);
          background: radial-gradient(1200px 600px at 10% -10%, #ffe9d6, transparent),
            radial-gradient(900px 500px at 110% 0%, #e8f1ff, transparent),
            var(--paper);
        }

        a {
          color: inherit;
        }

        .page {
          animation: fadeIn 320ms ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      <Component {...pageProps} />
    </>
  );
}
