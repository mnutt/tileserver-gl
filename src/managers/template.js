const path = require("path");
const fs = require("fs").promises;
const handlebars = require("handlebars");

const templatesPath = path.join(__dirname, "../../public/templates");

class TemplateManager {
  constructor() {
    this.compiled = {};
  }

  static async init() {
    const manager = new TemplateManager();

    const templateNames = await fs.readdir(templatesPath);

    for (let templateName of templateNames) {
      manager.add(templateName);
    }

    TemplateManager.instance = manager;
    return manager;
  }

  async add(templateFile) {
    const templatePath = path.join(templatesPath, templateFile);
    const templateData = await fs.readFile(templatePath);
    const compiledTemplate = handlebars.compile(templateData.toString());

    const templateName = templateFile.replace(/\.tmpl$/, "");
    this.compiled[templateName] = compiledTemplate;
  }

  get(name) {
    return this.compiled[name];
  }
}

module.exports = TemplateManager;
