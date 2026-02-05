-- Crear tabla message_templates para almacenar templates de mensajes personalizables
CREATE TABLE IF NOT EXISTS message_templates (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL UNIQUE CHECK (type IN ('autónomo', 'credencial', 'monotributo')),
  template TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Crear índice para búsquedas rápidas por tipo
CREATE INDEX IF NOT EXISTS idx_message_templates_type ON message_templates(type);

-- Insertar templates por defecto (opcional - puedes modificarlos después)
INSERT INTO message_templates (type, template) VALUES 
('autónomo', 'Hola {nombre}, buenos días, cómo estás? Te paso el vep de autónomo vence {caducate}.\n')
ON CONFLICT (type) DO NOTHING;

INSERT INTO message_templates (type, template) VALUES 
('credencial', 'Hola {nombre}, buenos días, cómo estás? Te paso la credencial del monotributo de {mes_siguiente}, vence el {caducate}. El mismo ya cuenta con la recategorizacion.\n')
ON CONFLICT (type) DO NOTHING;

INSERT INTO message_templates (type, template) VALUES 
('monotributo', 'Hola {nombre}, buenos días, cómo estás? Te paso el vep del monotributo del mes de {mes_siguiente}, vence el {caducate}. el mismo ya tiene la recategorizacion realizada.\n')
ON CONFLICT (type) DO NOTHING;

-- Comentarios sobre las variables disponibles
COMMENT ON TABLE message_templates IS 'Templates de mensajes personalizables para jobs programados. Variables disponibles: {nombre}, {alter_name}, {real_name}, {caducate}, {mes}, {año}, {mes_siguiente}, {tipo}';
COMMENT ON COLUMN message_templates.type IS 'Tipo de job: autónomo, credencial o monotributo';
COMMENT ON COLUMN message_templates.template IS 'Template del mensaje con variables entre llaves {variable}';
