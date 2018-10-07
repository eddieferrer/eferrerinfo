const sass = require("node-sass");
module.exports = function(grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON("package.json"),
    sass: {
      options: {
        implementation: sass,
        sourceMap: true
      },
      dist: {
        files: {
          "styles.css": "styles.scss"
        }
      }
    },
    watch: {
      css: {
        files: "**/*.scss",
        tasks: ["sass"]
      }
    }
  });
  grunt.loadNpmTasks("grunt-sass");
  grunt.loadNpmTasks("grunt-contrib-watch");
  grunt.registerTask("default", ["sass"], ["watch"]);
};
