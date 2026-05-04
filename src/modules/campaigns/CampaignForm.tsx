'use client';

import { useState } from 'react';

type TemplateOption = {
  name: string;
  language: string;
};

export function CampaignForm({ templates }: { templates: TemplateOption[] }) {
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [language, setLanguage] = useState('es');

  function handleTemplateChange(name: string) {
    setSelectedTemplate(name);
    const tpl = templates.find((t) => t.name === name);
    if (tpl) setLanguage(tpl.language);
  }

  return (
    <form className="grid-form" action="/api/campaigns/create" method="post" encType="multipart/form-data">
      <input name="name" placeholder="Nombre de campaña" required />
      <select
        name="templateName"
        required
        value={selectedTemplate}
        onChange={(e) => handleTemplateChange(e.target.value)}
      >
        <option value="">Seleccionar plantilla…</option>
        {templates.map((tpl) => (
          <option key={tpl.name} value={tpl.name}>
            {tpl.name} ({tpl.language})
          </option>
        ))}
      </select>
      <input name="templateLanguage" value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="Idioma" required />
      <label className="checkbox"><input type="checkbox" name="includeAudience" /> Incluir todos los contactos activos</label>
      <input name="confirmation" placeholder="Escribí BORRADOR" required />
      <button type="submit">Crear borrador</button>
    </form>
  );
}
