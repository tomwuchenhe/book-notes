import express from "express";
import ejs from "ejs";
import axios from "axios";
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth2";
import session from "express-session";
import env from "dotenv";

//not redirecting authenticated user to desired page, adding is authenticating on / route
//more clarification on create note(Button can be used) button (isbn) button(id)
//delete and edited postID, can be designed as a drop down postID 1 2 3
const app = express();
const port = 3000;
const saltRounds = 10;
env.config();

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

db.connect();

async function createTables() {
    try {
      await db.query(`
            CREATE TABLE IF NOT EXISTS user_info (
              id SERIAL PRIMARY KEY,
              user_name VARCHAR(60) NOT NULL UNIQUE,
              password VARCHAR(100) NOT NULL
            );
          `);
      await db.query(`CREATE TABLE IF NOT EXISTS user_record (
        id SERIAL,
        user_name VARCHAR(60) REFERENCES user_info(user_name),
        title VARCHAR(60) NOT NULL,
        content VARCHAR(200) NOT NULL,
        imgpath VARCHAR(100),
        PRIMARY KEY (id, user_name)
      );`);
      console.log('Tables created successfully.');
    } catch (err) {
      console.error('Error creating tables:', err);
    }
}

await createTables();

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(passport.initialize());
app.use(passport.session());

app.set('trust proxy', true);

function getUsername(email) {
    if (typeof email !== 'string') {
      throw new Error('Input must be a string');
    }
    
    const [username] = email.split('@');
    return username;
  }
  
function modifyName(posts){
    let newName = []
    let new_obj = []
    posts.forEach((post) => {
        newName.push(getUsername(post.user_name))
    })
    for (let i = 0; i < posts.length; i++) {
        new_obj.push({
            id: posts[i].id,
            user_name: newName[i],
            title: posts[i].title,
            content: posts[i].content,
            imgpath: posts[i].imgpath
        })
    }
    return new_obj
}
  
async function getBook(key, value, size) {
  try {
    const url = `https://covers.openlibrary.org/b/${key}/${value}-${size}.jpg?default=false`;
    await axios.get(url);
    return url;
  } catch {
    return false;
  }
}

async function insertRecord(imgPath, username, title, content) {
  try {
    await db.query(
      "INSERT INTO user_record(user_name, title, content, imgpath) values($1, $2, $3, $4)",
      [username, title, content, imgPath]
    );
    return true;
  } catch {
    return false;
  }
}

async function getAllRecord() {
  const response = await db.query(
    "SELECT a.*, b.user_name FROM user_record a INNER JOIN user_info b ON a.user_name = b.user_name ORDER BY a.id ASC"
  );
  return response.rows;
}

async function deleteRecordVerify(id, uname) {
  const auth = await db.query(
    "SELECT * FROM user_record a INNER JOIN user_info b ON a.user_name = b.user_name WHERE a.id = $1 AND b.user_name = $2",
    [id, uname]
  );
  if (auth.rows.length === 0) {
    return false;
  }
  return auth.rows[0].password;
}

async function deleteRecord(id) {
  try {
    await db.query("DELETE FROM user_record WHERE id = $1", [id]);
    return true;
  } catch {
    console.log("db errer");
    return false;
  }
}

async function editRecordVerify(id, uname) {
  try {
    const auth = await db.query(
      "SELECT * FROM user_record a INNER JOIN user_info b ON a.user_name = b.user_name WHERE a.id = $1 AND b.user_name = $2",
      [id, uname]
    );
    if (auth.rows.length === 0) {
      return false;
    }
    return auth.rows[0].password;
  } catch {
    console.log("db error");
    return false;
  }
}

async function editDBrecord(id, message) {
    try {
        for (const [key, value] of Object.entries(message)) {
            console.log(`${key}: ${value}`);
            await db.query(`UPDATE user_record SET ${key} = $1 WHERE id = $2`, [
                value,
                id,
            ]);
        }
        return true
    } catch (err) {
        console.log(err)
        return false
    }
  }




app.get("/register", (req, res) => {
  res.render("register.ejs");
});

app.post("/register", async (req, res) => {
  const email = req.body.username;
  const password = req.body.password;

  try {
    const checkResult = await db.query(
      "SELECT * FROM user_info WHERE user_name = $1",
      [email]
    );

    if (checkResult.rows.length > 0) {
      res.render("register.ejs", {warning: "User already exists"});
    } else {
      bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
          console.error("Error hashing password:", err);
        } else {
          const result = await db.query(
            "INSERT INTO user_info (user_name, password) VALUES ($1, $2) RETURNING *",
            [email, hash]
          );
          const user = result.rows[0];
          console.log(user);
          req.login(user, (err) => {
            res.redirect("/home");
          });
        }
      });
    }
  } catch (err) {
    console.log(err);
  }
});

app.get("/", (req, res) => {
    if (req.isAuthenticated()) {
        res.redirect("/home")
    } else {
    res.render("login.ejs");
    }
});

app.post("/create-account", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) {
      return next(err); // Handle error
    }
    if (!user) {
      // If user is not found or password is incorrect
      return res.render("login.ejs", { message: info.message || "Login failed" });
    }
    req.logIn(user, (err) => {
      if (err) {
        return next(err); // Handle error
      }
      return res.redirect("/home");
    });
  })(req, res, next);
});


app.get("/home", async (req, res) => {
    console.log("This is the user requesting information for cookies and session:", req.user)
    console.log("This is the user IP:", req.ip)
  if (req.isAuthenticated()) {
    let posts = await getAllRecord();
    res.render("index.ejs", { posts: modifyName(posts) });
  } else {
    res.redirect("/");
  }
});

app.get(
    "/auth/google",
    passport.authenticate("google", {
      scope: ["profile", "email"],
    })
  );

  
  
  app.get(
    "/auth/google/booknote",
    passport.authenticate("google", {
      successRedirect: "/home",
      failureRedirect: "/",
    })
  );
  

app.get("/create-note", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("form.ejs");
  } else {
    res.redirect("/");
  }
});

app.post("/create-note", async (req, res) => {
  let response;
  const imgPath = await getBook(req.body.key, req.body.value, req.body.size);
  console.log(req.body)
  if (imgPath != false) {
    response = await insertRecord(
      imgPath,
      req.user.user_name,
      req.body.title,
      req.body.content
    );
  } else {
    response = await insertRecord(
      "https://user-images.githubusercontent.com/24848110/33519396-7e56363c-d79d-11e7-969b-09782f5ccbab.png",
      req.user.user_name,
      req.body.title,
      req.body.content
    );
  }
  //console.log(response);
  if (response) {
    res.redirect("/home");
    //consider delete this as user need to be verified before going here
  } else {
    res.render("form.ejs", {
      success: "Database error",
    });
  }
});

app.get("/delete-post", (req, res) => {
  if (req.isAuthenticated()) {
    console.log(req.profile)
    if (req.user.password === "google") {
        res.render("form_del.ejs", {
            auth: "google",
            user: getUsername(req.user.user_name)
        })
    } else {
        res.render("form_del.ejs", {
            auth: "regular",
            user: req.user.user_name
        });
    }
  } else {
    res.redirect("/");
  }
});

app.post("/delete-post", async (req, res) => {
  const password = await deleteRecordVerify(
    req.body.post_id,
    req.user.user_name
  );
  const userpassword = req.body.password;
  if (password === "google") {
    console.log(`${req.user.email} is deleting ${req.body.post_id}`)
    await deleteRecord(req.body.post_id);
    res.redirect("/home");
  } else {
    bcrypt.compare(userpassword, password, async (err, valid) => {
        if (err) {
          console.log("Error comparing passwords:");
            res.render("form_del.ejs", {
                auth: req.user.password === "google" ? "google" : "regular",
                success: "id you enter does not exist or other people post or password wrong",
                user: getUsername(req.user.user_name)
            });
        } else {
          if (valid) {
            await deleteRecord(req.body.post_id);
            res.redirect("/home");
          } else {
            res.render("form_del.ejs", { 
                auth: req.user.password === "google" ? "google" : "regular",
                success: "Password Incorrect",
                user: getUsername(req.user.user_name) });
          }
        }
      });
  }
  
});

app.get("/edit-post", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("form_edit.ejs", {
        auth: req.user.password === "google" ? "google" : "regular",
        user: getUsername(req.user.user_name)
    });
  } else {
    res.redirect("/");
  }
});

app.post("/edit-post", async (req, res) => {
  let message = {};
  let userpassword
  if (req.body.title) {
    message.title = req.body.title;
  }
  if (req.body.content) {
    message.content = req.body.content;
  }
  console.log(message);
  if (req.user.password !== "google") {
    userpassword = req.body.password;
  }
  const password = await editRecordVerify(req.body.post_id, req.user.user_name);
  if (password === "google") {
    console.log(`${req.user.email} is editing on ${req.body.post_id}`)
    await editDBrecord(req.body.post_id, message);
    res.redirect("/home");
  } else {
    bcrypt.compare(userpassword, password, async (err, valid) => {
        if (err) {
          console.log("Error comparing passwords:");
          res.render("form_edit.ejs", {
            auth: req.user.password === "google" ? "google" : "regular",
            user: getUsername(req.user.user_name),
            success: "id not found or other people post or password wrong",
          });
        } else {
          if (valid) {
            await editDBrecord(req.body.post_id, message);
            res.redirect("/home");
          } else {
            res.render("form_edit.ejs", { success: "Password Incorrect",
                auth: req.user.password === "google" ? "google" : "regular",
            user: getUsername(req.user.user_name)
             });
          }
        }
      });
  }
});

passport.use(
  "local",
  new Strategy(async function verify(username, password, cb) {
    try {
      const result = await db.query(
        "SELECT * FROM user_info WHERE user_name = $1 ",
        [username]
      );
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const storedHashedPassword = user.password;
        bcrypt.compare(password, storedHashedPassword, (err, valid) => {
          if (err) {
            console.error("Error comparing passwords:", err);
            return cb(err);
          } else {
            if (valid) {
              return cb(null, user);
            } else {
              return cb(null, false, { message: 'Wrong password' });
            }
          }
        });
      } else {
        return cb(null, false, { message: 'User Not found' });
      }
    } catch (err) {
      console.log(err);
    }
  })
);

passport.use(
  "google",
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      //local dev use http://localhost:3000/auth/google/booknote
      callbackURL: "http://localhost:3000/auth/google/booknote" ,
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    },
    async (accessToken, refreshToken, profile, cb) => {
        console.log("This is user profile infomation", profile)
      try {
        const result = await db.query("SELECT * FROM user_info WHERE user_name = $1", [
          profile.email,
        ]);
        if (result.rows.length === 0) {
          const newUser = await db.query(
            "INSERT INTO user_info (user_name, password) VALUES ($1, $2)",
            [profile.email, "google"]
          );
          return cb(null, newUser.rows[0]);
        } else {
          return cb(null, result.rows[0]);
        }
      } catch (err) {
        return cb(err);
      }
    }
  )
);

passport.serializeUser((user, cb) => {
  cb(null, user);
});

passport.deserializeUser((user, cb) => {
  cb(null, user);
});

app.listen(port, () => {
  console.log("listening at", port);
});
