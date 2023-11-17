import express from "express";
import bodyParser from "body-parser";
import pg from "pg";

const app = express();
const port = 3000;
const stdLimit = 20;
const orders = [
    {
        abrev: 'cro',
        sort: 'ano_aprox ASC'
    },
    {
        abrev: 'adp',
        sort: 'id ASC'
    },
    {
        abrev: 'adu',
        sort: 'id DESC'
    },
    {
        abrev: 'alf',
        sort: 'nome ASC'
    }
]
const db = new pg.Client(
    {
        user: "postgres",
        host: "localhost",
        database: "Jelis_DB",
        password: "coloque-sua-senha-aqui",
        port: 5432      
    }
);
db.connect();

// Middleware
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));


// Route -- Início
app.get("/", (req, res) => {
    res.render("index.ejs", {
        title: "Início",
        recents: getRecents()
    });
});


// Route -- Lista de Livros
app.get("/livros", async (req, res) => {

    let totalPages = await getTotalPages(stdLimit);

    let currentPage = 1
    if (req.query.page && req.query.page > 0 && req.query.page <= totalPages) {
        currentPage = parseInt(req.query.page);
    }

    let order = orders[0];
    if (req.query.order) {
        for (let i = 0; i < orders.length; i++) {
            if (orders[i]['abrev'] === req.query.order) {
                order = orders[i];
            }
        }
    }

    let autores = await getAuthorsAndBooks(order, currentPage);

    res.render("list.ejs", {
        title: "Lista de Livros",
        autores: autores,
        currentPage: currentPage,
        totalPages: totalPages,
        currentOrder: order['abrev']
    })
});

// Route -- Ver Livro
app.get("/livro", async (req, res) => {

    if (!req.query.id) {
        res.redirect("erro.ejs", {erro: 'Livro não existe.'})
    }

    let idLivro = parseInt(req.query.id);
    let livro = await getBookById(idLivro);
    let reading = await getReadingIdByBook(idLivro);

    res.render("book.ejs", {
        title: livro['titulo'],
        livro: livro,
        leitura: reading
    });
});

// Route - Novo Livro
app.get("/adLivro", async (req, res) => {

    res.render("addBook.ejs", {
        title: "Novo Livro",
        autores: await getAllAuthors()
    });

});

// Route - Minhas Leituras
app.get("/leituras", async (req, res) => {

    const readings = await getAllReadings();

    res.render("allReadings.ejs",
    {
        title: "Minhas Leituras",
        leituras: readings
    });
});

// Route - Ver Leitura
app.get("/leitura", async (req, res) => {

    if(!req.query.id) {
        res.send("Ficha não é valida.")
        return;
    }

    let idFicha = req.query.id;
    
    try {
        const ficha = await getReadingById(idFicha);
        const categorias = await getCategoriesByReadingId(idFicha);
        
        let catAtual = categorias[0]['id'];
        if (req.query.cat) {
            catAtual = req.query.cat;
        }
        const notas = await getNotesByCategoryId(catAtual);

        res.render("reading.ejs", {
            title: `Ficha: ${ficha.titulo}`,
            ficha: ficha,
            categorias: categorias,
            notas: notas,
            categoriaAtual: catAtual
        });

    } catch (error) {
        res.send("ERRO " + error);
        console.error(error);
    }

    
});

// Route - Nova Leitura
app.get("/adLeitura", async (req, res) => {

    let livros = await getNonReadedBooks();

    res.render("addReading.ejs", {
        title: "Começar Leitura",
        livros: livros
    })
});

// Route - Sobre Jelis
app.get("/sobre", async (req, res) => {
    res.render("about.ejs", {
        title: "Sobre Jelis"
    })
});

// Route - Como Ler Livros
app.get("/comoLerLivros", async (req, res) => {
    res.render("adler.ejs", {
        title: "Como Ler Livros"
    })
});

// Route - Pesquisar
app.get("/pesquisar", async (req, res) => {
    let search = req.query.q;
    let result = [];
    if (search) {
        result = await searchByTitleAuthor(search);
    }
    res.render("search.ejs", {
        title: `${search} - pesquisa`,
        livros: result
    });
});




// Post - Salvar Leitura
app.post("/svLeitura", async (req, res) => {
    let book = await getBookById(req.body.idLivro);

    if (book) {
        try {
            let newId = await saveReading(req.body.idLivro);
            res.redirect(`/leitura?id=${newId}`);
        } catch (error) {
            console.error(error);
        }
    }
});

// Post - Deletar Leitura
app.post("/delLeitura", async (req, res) => {
    const idFicha = req.body.idFicha;

    try {
        await deleteReading(idFicha);
        res.redirect('/leituras');
    } catch (error) {
        console.error(error);
        res.send("Erro: " + error);
    }
});

// Post - Adicionar Categoria
app.post("/adCategoria", async (req, res) => {
    const nome = req.body.nome;
    const idFicha = req.body.idFicha;

    try {
        const newCat = await insertCategory(idFicha, nome);
        res.redirect(`/leitura?id=${idFicha}&cat=${newCat}`);
    } catch (error) {
        console.error(error);
        res.send("Error: " + error);
    }
});

// Post - Editar Categoria
app.post("/edCat", async (req, res) => {
    const idCategoria = req.body.idCategoria;
    const nome = req.body.nome;

    try {
        await updateCategory(idCategoria, nome);
        res.redirect('back');
    } catch (error) {
        console.error(error);
        res.send("Erro: " + error);
    }
});

// Post - Deletar Categoria
app.post("/delCat", async (req, res) => {
    const idCategoria = req.body.idCategoria;
    const idFicha = req.body.idFicha;

    try {
        await deleteCategory(idCategoria);
        res.redirect(`/leitura?id=${idFicha}`);
    } catch (error) {
        console.error(error);
        res.send("Erro: " + error);
    }
});

// Post - Adicionar Nota
app.post("/svNota", async (req, res) => {
    const idCategoria = req.body.idCategoria;
    const titulo = req.body.titulo;
    const conteudo = req.body.conteudo;

    try {
        await insertNote(titulo, conteudo, idCategoria);
        res.redirect('back');
    } catch (error) {
        console.error(error);
        res.send("ERRO: " + error);
    }
});

// Post - Editar Nota
app.post("/edNota", async (req, res) => {
    const idNota = req.body.idNota;
    const titulo = req.body.titulo;
    const conteudo = req.body.conteudo;

    try {
        await updateNote(idNota, titulo, conteudo);
        res.redirect('back');
    } catch (error) {
        console.error(error);
        res.send("Erro: " + error);
    }
});

// Post - Deletar Nota
app.post("/delNota", async (req, res) => {
    const idNota = parseInt(req.body.idNota);

    try {
        await deleteNote(idNota);
        res.redirect('back');
    } catch (error) {
        console.error(error);
        res.send(error);
    }
});

// Post - Adicionar Livro
app.post("/svLivro", async (req, res) => {
    const tipoAutor = req.body.tipoAutor

    if (tipoAutor != "existente" && tipoAutor != "novo") {
        res.send("Tipo de autor inválido.");
        return;
    }


    try {
        const titulo = req.body.titulo;
        let idAutor = '';

        if (tipoAutor === "existente") {
            idAutor = req.body.idAutor;
        } else {
            let nomeAutor = req.body.nomeAutor;
            let nascAutor = req.body.nascAutor;
            let falesAutor = req.body.falesAutor;
            idAutor = await insertAuthor(nomeAutor, nascAutor, falesAutor);
        }

        const novoLivro = await insertBook(titulo, idAutor);
        res.redirect(`/livro?id=${novoLivro}`);
        
    } catch (error) {
        console.error(error);
        res.send('Erro: ' + error);
    }

});

// Post - Editar Livro
app.post("/edLivro", async (req, res) => {
    const tituloLivro = req.body.tituloLivro;
    const idLivro = req.body.idLivro;

    try {
        await updateBook(idLivro, tituloLivro);
        res.redirect('back');
    } catch (error) {
        console.error(error);
        res.send(error);
    }

});

// Post - Deletar Livro
app.post("/delLivro", async (req, res) => {
    const idLivro = req.body.idLivro;

    try {
        await deleteBook(idLivro);
        res.redirect('/livros');
    } catch (error) {
        console.log(error);
        res.send("Erro: " + error);
    }

});


// Listen 
app.listen(port, () => {
    console.log(`Online on port ${port}.`);
});


// Database Related
async function getRecents() {
    const query = "SELECT titulo, nome AS autor FROM ficha_de_leitura fdl JOIN livro l ON fdl.id_livro = l.id JOIN autor au ON au.id = l.id_autor;";
    const dbResponse = await db.query(query);
    const data = dbResponse.rows
    return data;
}

async function getAuthorsAndBooks(order, page) {

    let offSet = 0;

    if (page > 1) {
        offSet = (page -1) * 20;
    }
    const query = `SELECT id, ano_aprox, nome, periodo FROM autor ORDER BY ${order.sort} LIMIT $1 OFFSET $2;`
    const dbResponse = await db.query(query, [stdLimit, offSet]);
    const data = dbResponse.rows;

    let autores = [];

    for (let i = 0; i < data.length; i++) {
        let livros = await getBooksByAuthor(data[i].id);
        if (livros.length > 0) {
            autores.push({
                nome: data[i].nome,
                periodo: data[i].periodo,
                livros: livros
            });
        }
    }


    return autores;
}

async function getBooksByAuthor(authorId) {
    const query = "SELECT * FROM livro WHERE id_autor = $1";
    const dbResponse = await db.query(query, [authorId]);
    const data = dbResponse.rows;
    return data;
}

async function getTotalPages(limit) {
    const query = "SELECT COUNT (id) FROM autor;";
    const dbResponse = await db.query(query);
    const data = dbResponse.rows[0]['count'];

    const pages = Math.ceil(data / limit);
    return pages;
}

async function getBookById(id) {
    const query = "SELECT li.id AS id_livro, titulo, id_autor, nome, ano_aprox, periodo FROM livro li JOIN autor au ON au.id = li.id_autor WHERE li.id = $1";
    const dbResponse = await db.query(query, [id]);
    const data = dbResponse.rows[0];
    return data;
}

async function getAllAuthors() {
    const query = "SELECT * FROM autor ORDER BY nome ASC;";
    const dbResponse = await db.query(query);
    const data = dbResponse.rows;
    return data;
}

async function getNonReadedBooks() {
    const query = "SELECT li.id, titulo, nome FROM livro li LEFT JOIN ficha_de_leitura fl ON li.id = fl.id_livro JOIN autor au ON li.id_autor = au.id WHERE fl.id_livro IS NULL ORDER BY li.titulo ASC;"
    const dbResponse = await db.query(query);
    const data = dbResponse.rows;
    return data;
}

async function searchByTitleAuthor(search) {
    const query = `SELECT li.id, titulo, nome, periodo FROM livro li JOIN autor au ON li.id_autor = au.id WHERE (lower(titulo) LIKE lower('%${search}%') OR lower(nome) LIKE lower('%${search}%')) ORDER BY CHAR_LENGTH(titulo) LIMIT 45;`;
    const dbResponse = await db.query(query);
    const data = dbResponse.rows;
    return data;
}

async function saveReading(bookId, status='le') {
    const query = "INSERT INTO ficha_de_leitura (id_livro, status) VALUES ($1, $2) RETURNING id";
    const dbResponse = await db.query(query, [bookId, status]);
    const newId = dbResponse.rows[0]['id'];
    const catDefault = "INSERT INTO categoria (nome, id_ficha_de_leitura) VALUES ('Geral', $1)";
    await db.query(catDefault, [newId]);
    return newId;
}

async function getReadingIdByBook(bookId) {
    const query = "SELECT fl.id FROM ficha_de_leitura fl JOIN livro li ON li.id = fl.id_livro WHERE li.id = $1;";
    const dbResponse = await db.query(query, [bookId]);
    const data = dbResponse.rows;
    return data;
}

async function getAllReadings() {
    const query = "SELECT fl.id AS id_leitura, li.id AS id_livro, titulo, nome FROM ficha_de_leitura fl JOIN livro li ON li.id = fl.id_livro JOIN autor au ON li.id_autor = au.id ORDER BY fl.id DESC;"
    const dbResponse = await db.query(query);
    const data = dbResponse.rows;
    return data;
}

async function getReadingById(id) {
    const query = "SELECT fl.id, id_livro, titulo, id_autor FROM ficha_de_leitura fl JOIN livro li ON li.id = fl.id_livro WHERE fl.id = $1";
    const dbResponse = await db.query(query, [id]);
    const data = dbResponse.rows[0];
    return data;
}

async function getCategoriesByReadingId(id) {
    const query = "SELECT * FROM categoria WHERE id_ficha_de_leitura = $1";
    const dbResponse = await db.query(query, [id]);
    const data = dbResponse.rows;
    return data;
}

async function getNotesByCategoryId(id) {
    const query = "SELECT * FROM nota WHERE id_categoria = $1";
    const dbResponse = await db.query(query, [id]);
    const data = dbResponse.rows;
    return data;
}

async function insertCategory(idFicha, nome) {
    const query = "INSERT INTO categoria (nome, id_ficha_de_leitura) VALUES ($1, $2) RETURNING id";
    const dbResponse = await db.query(query, [nome, idFicha]);
    const newId = dbResponse.rows[0]['id'];
    return newId;
}

async function updateCategory(idCategoria, nome) {
    const query = "UPDATE categoria SET nome = $1 WHERE id = $2";
    const dbResponse = await db.query(query, [nome, idCategoria]);
    return true;
}

async function insertNote(titulo, conteudo, id_categoria) {
    const query = "INSERT INTO nota (titulo, conteudo, id_categoria) VALUES ($1, $2, $3);";
    await db.query(query, [titulo, conteudo, id_categoria]);
    return true;
}

async function updateNote(idNota, titulo, conteudo) {
    const query = "UPDATE nota SET titulo = $1, conteudo = $2 WHERE id = $3";
    await db.query(query, [titulo, conteudo, idNota]);
    return true;
}

async function deleteNote(idNota) {
    const query = "DELETE from nota WHERE id = $1";
    await db.query(query, [idNota]);
    return true;
}

async function deleteCategory(id) {
    const query = "DELETE FROM categoria WHERE id = $1";
    await db.query(query, [id]);
    return true;
}

async function deleteReading(id) {
    const query = "DELETE FROM ficha_de_leitura WHERE id = $1";
    await db.query(query, [id]);
    return true;
}

async function insertBook(titulo, idAutor) {
    const query = "INSERT INTO livro (titulo, id_autor) VALUES ($1, $2) RETURNING id";
    const dbResponse = await db.query(query, [titulo, idAutor]);
    const idLivro = dbResponse.rows[0]['id'];
    return idLivro;
}

async function updateBook(id, titulo) {
    const query = "UPDATE livro SET titulo = $1 WHERE id = $2";
    await db.query(query, [titulo, id]);
    return true;
}

async function insertAuthor(nome, dtNasc, dtFales) {
    let periodo = "";
    let dtNascFormatted = "";
    let dtFalesFormatted = "";

    if (dtFales < 0) {
        dtFalesFormatted = `${Math.abs(dtFales)} a.C`
    } else {
        dtFalesFormatted = `${dtFales}`
    }

    if (dtNasc < 0) {
        dtNascFormatted = `${Math.abs(dtNasc)} a.C`
    } else {
        dtNascFormatted = `${dtNasc}`
    }
    periodo = `${dtNascFormatted} - ${dtFalesFormatted}`

    const query = "INSERT INTO autor (nome, ano_aprox, periodo) VALUES ($1, $2, $3) RETURNING id";
    const dbResponse = await db.query(query, [nome, dtFales, periodo]);
    const data = dbResponse.rows[0]['id'];
    return data;
}

async function deleteBook(idLivro) {
    const query = "DELETE FROM livro WHERE id = $1";
    await db.query(query, [idLivro]);
    return true;
}