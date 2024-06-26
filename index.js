import express from "express"
import ejs from "ejs"
import axios from "axios"
import pg from "pg"

const app = express()
const port = 3000
const db = new pg.Client({
    user: "postgres",
    host: "localhost",
    password: "1201",
    port: 5432,
    database: "booknote"
})

db.connect()


app.use(express.urlencoded({extended: true}))
app.use(express.static("public"))

async function getBook(key, value, size) {
    try {
        const url = `https://covers.openlibrary.org/b/${key}/${value}-${size}.jpg?default=false`
        await axios.get(url)
        return url
    } catch {
        return false
    }
    
}

async function registerUser(username, password) {
    try {
        await db.query("INSERT INTO user_info(user_name, password) values($1, $2)", [username, password])
        return true
    } catch {
        return false
    }
}

async function insertRecord(imgPath, username, title, content) {
    try {
        await db.query("INSERT INTO user_record(user_name, title, content, imgpath) values($1, $2, $3, $4)", [username, title, content, imgPath])
        return true
    } catch {
        return false
    }
}

async function getAllRecord() {
    const response = await db.query("SELECT a.*, b.user_name FROM user_record a INNER JOIN user_info b ON a.user_name = b.user_name ORDER BY a.id ASC" )
    return response.rows
}


async function deleteRecord(id, uname, pwd) {
        const auth = await db.query("SELECT * FROM user_record a INNER JOIN user_info b ON a.user_name = b.user_name WHERE a.id = $1 AND b.password = $2 AND b.user_name = $3", [id, pwd, uname])
        if (auth.rows.length === 0) {
            return false
        }
        await db.query("DELETE from user_record WHERE id = $1", [id])
        return true
        
}


async function editRecord(id, uname, pwd, message) {
    const auth = await db.query("SELECT * FROM user_record a INNER JOIN user_info b ON a.user_name = b.user_name WHERE a.id = $1 AND b.password = $2 AND b.user_name = $3", [id, pwd, uname])
    if (auth.rows.length === 0) {
        return false
    }
    if (message.title) {
        await db.query("UPDATE user_record SET title = $1 WHERE id = $2", [message.title, id])
        if (message.content) {
            await db.query("UPDATE user_record SET content = $1 WHERE id = $2", [message.content, id])
            return true
        } else {
            return true
        }
    } 
}

app.get("/", async (req, res) => {
    const posts = await getAllRecord()
    res.render("index.ejs", {posts: posts})
})

app.post("/create-note", (req, res) => {
    res.render("form.ejs")
    
})


app.post("/submit-notes", async (req, res) => {
    let response
    const imgPath = await getBook(req.body.key, req.body.value, req.body.size)
    console.log(imgPath)
    if (imgPath != false) {
        response = await insertRecord(imgPath, req.body.username, req.body.title, req.body.content)
    } else {
        response = await insertRecord('https://user-images.githubusercontent.com/24848110/33519396-7e56363c-d79d-11e7-969b-09782f5ccbab.png', req.body.username, req.body.title, req.body.content)
    }
    console.log(response)
    if (response) {
        res.redirect("/")
    } else {
        res.render("form.ejs", {success: "error inserting, go create account first"})
    }
})
app.post("/create-account", async (req, res) => {
    res.render("registration.ejs")
})

app.post("/submit-registration", async (req, res) => {
    const response = await registerUser(req.body.username, req.body.password)
    if (response) {
        res.redirect("/")
    } else {
        res.render("registration.ejs", {success: response})
    }
})

app.post("/delete-post", (req, res)=>{
    res.render("form_del.ejs")
})

app.post("/submit-delete-post", async (req, res) => {
    const response = await deleteRecord(req.body.post_id, req.body.username, req.body.password)
    if (response) {
        res.redirect("/")
    } else {
        res.render("form_del.ejs", {success: "Combination Error"})
    }
    
})

app.post("/edit-post", (req, res) => {
    res.render("form_edit.ejs")
})

app.post("/submit-edit-post", async (req, res) => {
    let message = {}
    if (req.body.title) {
        message.title = req.body.title
    }
    if (req.body.content) {
        message.content = req.body.content
    }
    console.log(message)
    const response = await editRecord(req.body.post_id, req.body.username, req.body.password, message)
    if (response){
        res.redirect("/")
    } else {
        res.render("form_edit.ejs", {success: "Something Went Wrong"})
    }

})

app.listen(port, ()=>{
    console.log("listening at", port)
})