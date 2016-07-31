const path = require('path');
const fs = require('fs');
const gulp = require('gulp');
const data = require('gulp-data');
const nunjucks = require('gulp-nunjucks');
const nun = require('nunjucks');
const fm = require('front-matter');
const clean = require('gulp-clean');
const concat = require('gulp-concat');
const uglify = require('gulp-uglify');
const sass = require('gulp-sass');
const webserver = require('gulp-webserver');
const prettyUrl = require("gulp-pretty-url");
const runSequence = require('run-sequence');
const contentful = require('contentful');
const moment = require('moment');
const mkdirp = require('mkdirp');


// set up the contentful query client
var client = contentful.createClient({
  space: 'ot0mnooc6nee', 
  accessToken: 'c685bb6a2978131d6e287e6e1a6c1b1b71ce6cf3c7a3be2caa43cc6b4ec580eb'
});


// Clean up output directories
gulp.task('clean', function () {
  return gulp.src('dist/*', {read: false})
    .pipe(clean());
});
gulp.task('clean-scripts', function () {
  return gulp.src('dist/js/*', {read: false})
    .pipe(clean());
});


// Compile the views with the data found in the api sepcified in
// the template's front-matter.
// Additional data can be passed in the front-matter
gulp.task('generate', () =>
  gulp.src('views/*.html')
    .pipe(data(function(file) {
      var content = fm(String(file.contents));
      var apiData = {};
      for (var i = 0; i < content.attributes.api.length; i++) {
        var source = content.attributes.api[i].split(".json")[0].split("/")[1]; // better with a regexp.
        apiData[source] = require("./" + content.attributes.api[i]);
      }
      content.attributes.api = apiData ;
      content.attributes.baseTemplate = "./layouts/base.html";
      return content.attributes;
    }))
    .pipe(nunjucks.compile())
    .pipe(prettyUrl())
    .pipe(gulp.dest('dist'))
);




// var getDirName = path.dirname;

// function writeFile(path, contents, cb) {
//   mkdirp(getDirName(path), function (err) {
//     if (err) return cb(err);
//     fs.writeFile(path, contents, cb);
//   });
// }

// gulp.task('generate:events', () =>
//   gulp.src('api/nights.json')
//     .pipe(data(function(file) {
//       var nights = JSON.parse(file.contents);
//       for (var night = 0; night < nights.length; night++) {
//         var element = nights[night];
//         return nunjucks.compile('views/night.html', element);
//         // writeFile('dist/on/' + element.url + '/index.html', html); 
//       }

//     }))
//     .pipe(prettyUrl())
//     .pipe(gulp.dest('dist/on/'))
// );


// gulp.task('nun', function(){
//   var data = require('./api/nights.json');
//   nunjucks.configure('views', { autoescape: true });
//   for (var item = 0; item < data.length; item++) {
//     var element = data[item];
//     var out = nun.render('night.html', data[item]);
//     console.log(out);
   
//   }

// });



// copy the api files to the output directory
gulp.task('api', () =>
  gulp.src('api/**/*.json')
    .pipe(gulp.dest('dist/api'))
);



// Get the Acts data from the cloud CMS and stash it locally
gulp.task('get:acts', () =>
  client.getEntries({'content_type':'act'})
    .then(
      function(resp) {
        var dataObject = [];
        for (var item = 0; item < resp.items.length; item++) {
          dataObject.push(resp.items[item].fields)
        }
        fs.writeFileSync('api/acts.json', JSON.stringify(dataObject)); 
      }
    )
);



// Get the Nights data from the cloud CMS and stash it locally
gulp.task('get:nights', () =>
  client.getEntries({'content_type':'event'})
    .then(
      function(resp) {
        var dataObject = [];
        for (var item = 0; item < resp.items.length; item++) {
          var thisNight = resp.items[item].fields;
          var thisNightsActs = [];
          for (var night = 0; night < resp.items[item].fields.performers.length; night++) {
            thisNightsActs.push(resp.items[item].fields.performers[night].fields);
          }
          delete thisNight.performers;

          // format the date (until numjucks format support)
          thisNight.dateDisplay = moment(thisNight.date).format("MMMM Do YYYY");
          thisNight.url = moment(thisNight.date).format("YYY-MM-DD");
          thisNight.acts = thisNightsActs;

          // format the mc data
          if(thisNight.mc) {
            var mc = thisNight.mc.fields;
            delete thisNight.mc;
            thisNight.mc = mc;
          }

          dataObject.push(thisNight);
        }
        fs.writeFileSync('api/nights.json', JSON.stringify(dataObject)); 
      }
    )
);

// Get data from the cloud CMS and stash it locally
gulp.task('get', ['get:acts', 'get:nights']);



// Compile the client-side templates
gulp.task('precompile', () =>
  gulp.src('views/pages/*.html')
    .pipe(nunjucks.precompile())
    .pipe(concat('templates.js'))
    .pipe(uglify())
    .pipe(gulp.dest('dist/js'))
);


// Combine and compress javascript
gulp.task('scripts', () =>
  gulp.src(['js/libs/*.js', "js/*.js"])
    .pipe(concat('concat.js'))
    .pipe(uglify())
    .pipe(gulp.dest('dist/js'))
);

// Combine and compress javascript
gulp.task('images', () =>
  gulp.src(['images/*'])
    .pipe(gulp.dest('dist/images'))
);



// Compile CSS from Sass
gulp.task('sass', () =>
  gulp.src(['sass/**/*.scss'])
    .pipe(sass({outputStyle: 'compressed', includePaths: ['./sass/include']}).on('error', sass.logError))
    .pipe(gulp.dest('dist/style'))
);


gulp.task('sass:watch', () =>
  gulp.watch('sass/**/*.scss', ['sass'])
);
gulp.task('templates:watch', () =>
  gulp.watch('views/**/*.html', ['generate','precompile'])
);



// serve the static dist folder
gulp.task('serve', function() {
  gulp.src('dist')
    .pipe(webserver({
      fallback: "greeting.html",
      livereload: false,
      open: false
    }));
});


// Our task runners
gulp.task('default', ['build:local']);
gulp.task('watch', ['sass:watch', 'templates:watch']);

gulp.task('build:local', function(callback) {
  runSequence(
    'clean',
    ['generate', 'images', 'scripts', 'sass', 'precompile', 'api'],
    callback
  );
});

gulp.task('build:prod', function(callback) {
  runSequence(
    'get',
    'build:local',
    callback
  );
});
