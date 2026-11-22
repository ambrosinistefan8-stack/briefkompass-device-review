// SYNTHETISCHE Beispielbriefe. Alle Namen, Behörden, Aktenzeichen und Nummern sind erfunden.

export const SAMPLES = [
  {
    id: 'nachweis',
    titel: 'Nachweis fehlt (SYNTHETISCH)',
    text: [
      'Musterverwaltung Beispielstadt – Sachgebiet Beispielleistungen',
      'Aktenzeichen: BK-2026-0417',
      '',
      'Sehr geehrte Frau Beispiel,',
      '',
      'zu Ihrem Antrag fehlt uns noch eine Nachweisunterlage. Bitte reichen Sie den Nachweis bis spätestens 15. Januar 2027 bei uns ein.',
      'Wir benötigen zudem eine aktuelle Bestätigung über Ihre Anschrift.',
      'Die Unterlagen gemäß Anlage 2 liegen diesem Schreiben nicht bei.',
      'Für Rückfragen erreichen Sie uns unter [Platzhalter für die Rufnummer].',
      '',
      'Mit freundlichen Grüßen',
      'Musterverwaltung (Beispiel)',
    ].join('\n'),
  },
  {
    id: 'widerspruch',
    titel: 'Widerspruchsfrist (SYNTHETISCH)',
    text: [
      'Beispielkasse Musterort – Mitteilung über eine Änderung',
      'Az.: 77-BEISPIEL-2',
      '',
      'Sehr geehrter Herr Muster,',
      '',
      'gegen unseren Bescheid vom 12. Oktober 2026 können Sie innerhalb von einem Monat nach Zustellung Widerspruch einlegen.',
      'Bitte teilen Sie uns bis zum 15.01.2027 mit, ob Sie an Ihrem Anliegen festhalten.',
      'Wir benötigen außerdem eine aktuelle Einkommensbescheinigung.',
      '',
      'Mit freundlichen Grüßen',
      'Beispielkasse (Platzhalter)',
    ].join('\n'),
  },
  {
    id: 'unklar',
    titel: 'Unklare Angaben (SYNTHETISCH)',
    text: [
      'Musterverein Beispielort',
      '',
      'Hallo,',
      '',
      'wir möchten Sie bitten, Ihre Unterlagen zeitnah zu übersenden. Rückmeldung bitte innerhalb von 14 Tagen.',
      'Der Termin wird noch bekannt gegeben.',
      '',
      'Viele Grüße',
    ].join('\n'),
  },
];
