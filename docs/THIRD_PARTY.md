# Third-party software

Dependencies and exact versions are recorded in package-lock.json. React, Zustand, TanStack, Lucide and ExcelJS carry their respective open-source licenses. Font Inter and JetBrains Mono are bundled under SIL Open Font License. License texts for directly bundled libraries/fonts are in docs/licenses; transitive package license notices are retained in installed dependencies and compiled library bundles.

PDF export uses pdf-lib and @pdf-lib/fontkit (MIT; see provided notices). DejaVu Sans fonts are distributed with their DejaVu/Bitstream Vera license at public/fonts/LICENSE-DejaVu.txt, also copied into dist/fonts by the build. Fonts are served locally; export does not fetch fonts from an external provider.
