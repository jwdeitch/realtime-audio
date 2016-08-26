package main

import (
	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/aws/aws-sdk-go/aws/session"

	"net/http"
	"sort"
	"fmt"
	"encoding/json"
	"time"
)

type object struct {
	Key          string
	LastModified time.Time
	Size         int64
}

type s3Object []object

func (s s3Object) Len() int {
	return len(s)
}
func (s s3Object) Swap(i, j int) {
	s[i], s[j] = s[j], s[i]
}
func (s s3Object) Less(i, j int) bool {
	return s[i].LastModified.Unix() < s[j].LastModified.Unix()
}

func recent(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	svc := s3.New(session.New(), &aws.Config{Region: aws.String("us-east-1")})
	objectList, _ := svc.ListObjectsV2(&s3.ListObjectsV2Input{
		Prefix: aws.String("r/"),
		Bucket: aws.String("a.rsa.pub")})

	var objects s3Object

	for _, obj := range objectList.Contents {
		if string(*obj.Key[len(*obj.Key) - 1:]) != "/" { // if not a dir
			objects = append(objects, object{*obj.Key, *obj.LastModified, *obj.Size})
		}
	}

	sort.Sort(objects)
	var max int = 6
	if len(objects) < 6 {
		max = len(objects)
	}

	response, _ := json.Marshal(objects[:max])

	fmt.Fprintf(w, string(response))
}

func main() {
	fmt.Println("port 8081")
	http.HandleFunc("/recent", recent)
	http.ListenAndServe(":8081", nil)
}