const path = require('path');
const fs = require('fs').promises;
const handlebars = require('handlebars');

const templatesPath = path.join(__dirname, '../../public/templates');

class TemplateManager {
  constructor() {
    this.compiled = {};
  }

  static async init(templateNames) {
    const manager = new TemplateManager();

    for (let templateName of templateNames) {
      manager.add(templateName);
    }

    TemplateManager.instance = manager;
    return manager;
  }

  async add(templateName) {
    const templatePath = path.join(templatesPath, `${templateName}.tmpl`);
    const templateData = await fs.readFile(templatePath);
    const compiledTemplate = handlebars.compile(templateData.toString());

    this.compiled[templateName] = compiledTemplate;
  }

  get(name) {
    return this.compiled[name];
  }
}

module.exports = TemplateManager;
