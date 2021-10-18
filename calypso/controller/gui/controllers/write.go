package controllers

import (
	"encoding/hex"
	"fmt"
	"net/http"
	"text/template"

	"go.dedis.ch/dela-apps/calypso/controller/gui/models"
)

// WriteHandler handles the write requests
func (c Ctrl) WriteHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			c.writeGET(w, r)
		case http.MethodPost:
			c.writePOST(w, r)
		default:
			c.renderHTTPError(w, "only GET and POST requests allowed", http.StatusBadRequest)
		}
	}
}

func (c Ctrl) writeGET(w http.ResponseWriter, r *http.Request) {
	t, err := template.ParseFiles(c.Abs("gui/views/layout.gohtml"),
		c.Abs("gui/views/write.gohtml"))
	if err != nil {
		c.renderHTTPError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var viewData = struct {
		Title       string
		PostMessage string
	}{
		"Write a message",
		"",
	}

	err = t.ExecuteTemplate(w, "layout", viewData)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}

func (c Ctrl) writePOST(w http.ResponseWriter, r *http.Request) {
	err := r.ParseForm()
	if err != nil {
		c.renderHTTPError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	kStr := r.PostForm.Get("k")
	if kStr == "" {
		c.renderHTTPError(w, "K is empty", http.StatusBadRequest)
		return
	}

	cStr := r.PostForm.Get("c")
	if cStr == "" {
		c.renderHTTPError(w, "C is empty", http.StatusBadRequest)
		return
	}

	kBuf, err := hex.DecodeString(kStr)
	if err != nil {
		c.renderHTTPError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	cBuf, err := hex.DecodeString(cStr)
	if err != nil {
		c.renderHTTPError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	kPoint := suite.Point()
	err = kPoint.UnmarshalBinary(kBuf)
	if err != nil {
		c.renderHTTPError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	cPoint := suite.Point()
	err = cPoint.UnmarshalBinary(cBuf)
	if err != nil {
		c.renderHTTPError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	adminIdentity := r.PostForm.Get("adminID")
	if adminIdentity == "" {
		c.renderHTTPError(w, "Admin identity is empty", http.StatusBadRequest)
		return
	}

	// readIdentities := r.PostForm["readID"]

	// ownerID := models.NewIdentity(adminIdentity)
	// d := darc.NewService()
	// d, err = d.Evolve(calypso.ArcRuleUpdate, ownerID)
	// if err != nil {
	// 	c.renderHTTPError(w, err.Error(), http.StatusInternalServerError)
	// 	return
	// }

	// d, err = d.Evolve(calypso.ArcRuleRead, ownerID)
	// if err != nil {
	// 	c.renderHTTPError(w, err.Error(), http.StatusInternalServerError)
	// 	return
	// }

	// for _, rid := range readIdentities {
	// 	d, err = d.Evolve(calypso.ArcRuleRead, models.NewIdentity(rid))
	// 	if err != nil {
	// 		c.renderHTTPError(w, err.Error(), http.StatusInternalServerError)
	// 		return
	// 	}
	// }

	id, err := c.caly.Write(models.NewEncryptedMsg(kPoint, cPoint), nil)
	if err != nil {
		c.renderHTTPError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	idHex := hex.EncodeToString(id)

	t, err := template.ParseFiles(c.Abs("gui/views/layout.gohtml"),
		c.Abs("gui/views/write.gohtml"))
	if err != nil {
		c.renderHTTPError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	viewMessage := fmt.Sprintf("Message saved! Please save the ID:\nID: %s", idHex)

	var viewData = struct {
		Title       string
		PostMessage string
	}{
		"Encrypt a message",
		viewMessage,
	}

	err = t.ExecuteTemplate(w, "layout", viewData)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

}
